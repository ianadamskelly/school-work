"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { createSession, destroySession, getSessionUser } from "./auth";
import { weeklyDraftLive, liveReportEvidence, reportData, reportingPeriod, syncDailyStatus } from "./work";

// ---------- auth ----------

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = getDb()
    .prepare("SELECT id, password_hash FROM users WHERE lower(email) = ? AND active = 1")
    .get(email) as { id: number; password_hash: string } | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    redirect("/login?error=1");
  }
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

function isDirectReport(managerId: number, employeeId: number): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM users WHERE id = ? AND manager_id = ?")
    .get(employeeId, managerId);
  return !!row;
}

// ---------- daily logs ----------

export async function addDailyLog(formData: FormData) {
  const user = await requireUser();
  const activity = String(formData.get("activity") ?? "").trim();
  if (!activity) redirect("/daily?error=activity");
  validateEvidence(formData, "/daily");
  const followupRequired = formData.get("followup_required") === "on" ? 1 : 0;
  const db = getDb();
  const logDate = String(formData.get("log_date"));
  const statusLabel = String(formData.get("status") ?? "Pending");
  const workStatus = statusLabel === "Completed" ? "completed" : statusLabel === "In Progress" ? "in_progress" : statusLabel === "Blocked" ? "blocked" : statusLabel === "Deferred" ? "deferred" : "planned";
  const requestedType = String(formData.get("work_type") ?? "planned");
  const workType = requestedType === "recurring" || requestedType === "reactive" ? requestedType : "planned";
  const focusId = numOrNull(formData.get("monthly_focus_area_id"));
  const outcome = String(formData.get("outcome") ?? "").trim();
  await withEvidence(db, formData, () => {
    const logId = Number(db.prepare("INSERT INTO daily_logs (user_id, log_date, category_id, activity, department_id, hours, outcome, followup_required, followup_date, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      user.id,
      logDate,
      numOrNull(formData.get("category_id")),
      activity,
      numOrNull(formData.get("department_id")),
      Number(formData.get("hours") ?? 0) || 0,
      outcome,
      followupRequired,
      followupRequired ? String(formData.get("followup_date") ?? "") || null : null,
      String(formData.get("priority") ?? "Medium"),
      statusLabel
    ).lastInsertRowid);
    let monthlyPlanId: number | null = null;
    let monthlyObjectiveId: number | null = null;
    let strategicObjectiveId: number | null = null;
    if (focusId) {
      const focus = db.prepare("SELECT mfa.monthly_objective_id, mp.id AS monthly_plan_id, (SELECT strategic_objective_id FROM monthly_objective_strategic_links WHERE monthly_objective_id = mo.id LIMIT 1) AS strategic_objective_id FROM monthly_focus_areas mfa JOIN monthly_objectives mo ON mo.id = mfa.monthly_objective_id JOIN monthly_plans mp ON mp.id = mo.plan_id WHERE mfa.id = ? AND mp.user_id = ? AND mp.status = 'approved'").get(focusId, user.id) as { monthly_objective_id: number; monthly_plan_id: number; strategic_objective_id: number | null } | undefined;
      if (!focus) redirect("/daily?error=objective");
      monthlyPlanId = focus.monthly_plan_id;
      monthlyObjectiveId = focus.monthly_objective_id;
      strategicObjectiveId = focus.strategic_objective_id;
    }
    const itemId = Number(db.prepare("INSERT INTO work_items (user_id, monthly_plan_id, monthly_objective_id, monthly_focus_area_id, objective_id, work_type, title, description, status, due_date, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END)").run(user.id, monthlyPlanId, monthlyObjectiveId, focusId, strategicObjectiveId, workType, activity, outcome, workStatus, logDate, workStatus).lastInsertRowid);
    return Number(db.prepare("INSERT INTO work_updates (user_id, work_item_id, update_date, text, status_after, legacy_daily_log_id) VALUES (?, ?, ?, ?, ?, ?)").run(user.id, itemId, logDate, outcome ? activity + ": " + outcome : activity, workStatus, logId).lastInsertRowid);
  });
  revalidatePath("/daily");
  revalidatePath("/daily/updates");
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
  redirect("/daily?saved=1");
}

export async function setDailyStatus(formData: FormData) {
  const user = await requireUser();
  const db = getDb();
  const logId = Number(formData.get("id"));
  const updateId = Number(formData.get("update_id"));
  const statusLabel = String(formData.get("status"));
  const workStatus = statusLabel === "Completed" ? "completed" : statusLabel === "In Progress" ? "in_progress" : "planned";
  db.transaction(() => {
    db.prepare("UPDATE daily_logs SET status = ? WHERE id = ? AND user_id = ?").run(statusLabel, logId, user.id);
    const update = db.prepare("SELECT work_item_id FROM work_updates WHERE (id = ? OR (? = 0 AND legacy_daily_log_id = ?)) AND user_id = ?").get(updateId, updateId, logId, user.id) as { work_item_id: number | null } | undefined;
    if (update?.work_item_id) {
      syncDailyStatus(update.work_item_id, workStatus);
      db.prepare("INSERT INTO work_updates(user_id,work_item_id,update_date,text,status_after) VALUES(?,?,date('now'),?,?)").run(user.id, update.work_item_id, `Marked ${workStatus.replace("_", " ")}.`, workStatus);
      db.prepare("UPDATE work_items SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(workStatus, workStatus, update.work_item_id, user.id);
    }
  })();
  revalidatePath("/daily");
  revalidatePath("/daily/updates");
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
}

export async function deleteDailyLog(formData: FormData) {
  const user = await requireUser();
  const db = getDb();
  const logId = Number(formData.get("id"));
  const updateId = Number(formData.get("update_id"));
  const update = db.prepare("SELECT id, work_item_id, legacy_daily_log_id FROM work_updates WHERE (id = ? OR (? = 0 AND legacy_daily_log_id = ?)) AND user_id = ?").get(updateId, updateId, logId, user.id) as { id: number; work_item_id: number | null; legacy_daily_log_id: number | null } | undefined;
  if (!update) return;
  const lockedReports = db.prepare("SELECT year,month,week_of_month FROM weekly_summaries WHERE user_id = ? AND status IN ('submitted','seen') AND activity_snapshot = ''").all(user.id) as { year: number; month: number; week_of_month: number }[];
  for (const report of lockedReports) reportData(user.id, report.year, report.month, report.week_of_month);
  const reports = db.prepare("SELECT activity_snapshot FROM weekly_summaries WHERE user_id = ? AND status IN ('submitted','seen')").all(user.id) as { activity_snapshot: string }[];
  if (reports.some((report) => report.activity_snapshot && (JSON.parse(report.activity_snapshot) as { items: { id: number }[] }[]).some((section) => section.items.some((item) => item.id === update.id)))) redirect("/daily/updates?error=reported");
  const files = db.prepare("SELECT stored_name FROM work_evidence WHERE work_update_id = ?").all(update.id) as { stored_name: string }[];
  db.transaction(() => {
    db.prepare("DELETE FROM work_updates WHERE id = ?").run(update.id);
    if (update.legacy_daily_log_id) db.prepare("DELETE FROM daily_logs WHERE id = ? AND user_id = ?").run(update.legacy_daily_log_id, user.id);
    if (update.work_item_id && !db.prepare("SELECT 1 FROM work_updates WHERE work_item_id = ?").get(update.work_item_id)) db.prepare("DELETE FROM work_items WHERE id = ? AND user_id = ?").run(update.work_item_id, user.id);
  })();
  for (const file of files) {
    if (path.basename(file.stored_name) !== file.stored_name) continue;
    const target = path.join(process.cwd(), "data", "evidence", file.stored_name);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  revalidatePath("/daily");
  revalidatePath("/daily/updates");
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
}

// ---------- objectives (owned by line managers) ----------

export async function createObjective(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");
  const title = String(formData.get("title") ?? "").trim();
  if (title) {
    getDb()
      .prepare("INSERT INTO objectives (manager_id, title, description) VALUES (?, ?, ?)")
      .run(user.id, title, str(formData, "description"));
  }
  revalidatePath("/team/objectives");
  redirect("/team/objectives");
}

export async function toggleObjective(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");
  getDb()
    .prepare("UPDATE objectives SET active = 1 - active WHERE id = ? AND manager_id = ?")
    .run(Number(formData.get("id")), user.id);
  revalidatePath("/team/objectives");
  redirect("/team/objectives");
}

// ---------- monthly plans ----------

export async function proposeMonthlyPlan(formData: FormData) {
  const user = await requireUser();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const objectiveIds = [...new Set(formData.getAll("objective_ids").map(Number).filter(Boolean))];
  const focusIds = formData.getAll("focus_ids").map(Number).filter(Boolean);
  if (objectiveIds.length === 0 || focusIds.length === 0) {
    redirect(`/monthly?error=plan&year=${year}&month=${month}`);
  }
  const db = getDb();

  // The objective must come from this person's line manager (or themselves if they manage others).
  const allowedObjectives = db
    .prepare(`SELECT id FROM objectives WHERE active = 1 AND id IN (${objectiveIds.map(() => "?").join(",")})
              AND (manager_id = ? OR manager_id = ?)`)
    .all(...objectiveIds, user.manager_id ?? -1, user.id) as { id: number }[];
  if (allowedObjectives.length !== objectiveIds.length) redirect(`/monthly?error=plan&year=${year}&month=${month}`);

  const existing = db
    .prepare("SELECT id, status FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?")
    .get(user.id, year, month) as { id: number; status: string } | undefined;
  if (existing?.status === "approved") redirect(`/monthly?year=${year}&month=${month}`);

  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO monthly_plans (user_id, year, month, objective_id, status, manager_feedback)
       VALUES (?, ?, ?, ?, 'proposed', '')
       ON CONFLICT (user_id, year, month) DO UPDATE SET
         objective_id = excluded.objective_id, status = 'proposed', approved_by = NULL, approved_at = NULL,
         manager_feedback = ''`
    ).run(user.id, year, month, objectiveIds[0]);
    const plan = db
      .prepare("SELECT id FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?")
      .get(user.id, year, month) as { id: number };
    db.prepare("DELETE FROM monthly_plan_focus WHERE plan_id = ?").run(plan.id);
    db.prepare("DELETE FROM monthly_plan_objectives WHERE plan_id = ?").run(plan.id);
    const ins = db.prepare("INSERT OR IGNORE INTO monthly_plan_focus (plan_id, focus_area_id) VALUES (?, ?)");
    for (const fid of focusIds) ins.run(plan.id, fid);
    const insertObjective = db.prepare("INSERT OR IGNORE INTO monthly_plan_objectives (plan_id, objective_id) VALUES (?, ?)");
    for (const oid of objectiveIds) insertObjective.run(plan.id, oid);
  });
  save();
  revalidatePath("/monthly");
  revalidatePath("/");
  redirect(`/monthly?saved=plan&year=${year}&month=${month}`);
}

export async function approveMonthlyPlan(formData: FormData) {
  const user = await requireUser();
  const planId = Number(formData.get("plan_id"));
  const db = getDb();
  const plan = db
    .prepare("SELECT id, user_id, year, month, submitted_at FROM monthly_plans WHERE id = ?")
    .get(planId) as { id: number; user_id: number; year: number; month: number; submitted_at: string | null } | undefined;
  if (!plan) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, plan.user_id));
  if (!allowed) redirect("/");
  if (!plan.submitted_at) redirect(`/team/${plan.user_id}`);
  db.prepare(
    "UPDATE monthly_plans SET status = 'approved', manager_feedback = '', approved_by = ?, approved_at = datetime('now') WHERE id = ?"
  ).run(user.id, planId);
  revalidatePath("/team");
  redirect(`/team/${plan.user_id}?approved=1&year=${plan.year}&month=${plan.month}`);
}

export async function requestMonthlyPlanChanges(formData: FormData) {
  const user = await requireUser();
  const planId = Number(formData.get("plan_id"));
  const feedback = str(formData, "manager_feedback");
  const db = getDb();
  const plan = db.prepare("SELECT id, user_id, year, month, submitted_at FROM monthly_plans WHERE id = ?").get(planId) as { id: number; user_id: number; year: number; month: number; submitted_at: string | null } | undefined;
  if (!plan) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, plan.user_id));
  if (!allowed) redirect("/");
  if (!plan.submitted_at) redirect(`/team/${plan.user_id}`);
  if (!feedback) redirect(`/team/${plan.user_id}?feedback=required&year=${plan.year}&month=${plan.month}`);
  db.prepare("UPDATE monthly_plans SET status = 'proposed', manager_feedback = ?, returned_at = datetime('now'), submitted_at = NULL, approved_by = NULL, approved_at = NULL WHERE id = ?")
    .run(feedback, planId);
  revalidatePath("/team");
  redirect(`/team/${plan.user_id}?feedback=1&year=${plan.year}&month=${plan.month}`);
}

// ---------- staff-owned monthly objectives ----------

async function requireEditablePlan(planId: number) {
  const user = await requireUser();
  const plan = getDb().prepare("SELECT id, status FROM monthly_plans WHERE id = ? AND user_id = ?").get(planId, user.id) as { id: number; status: string } | undefined;
  if (!plan || plan.status === "approved") redirect("/monthly");
  return user;
}

export async function addMonthlyWorkObjective(formData: FormData) {
  const user = await requireUser();
  const title = str(formData, "title");
  const outcome = str(formData, "intended_outcome");
  const strategicId = numOrNull(formData.get("strategic_objective_id"));
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!title || !outcome || !strategicId) redirect(`/monthly?error=objective&year=${year}&month=${month}`);
  const db = getDb();
  const strategic = db.prepare("SELECT id FROM objectives WHERE id = ? AND active = 1 AND (manager_id = ? OR manager_id = ?)")
    .get(strategicId, user.manager_id ?? -1, user.id);
  if (!strategic) redirect(`/monthly?error=objective&year=${year}&month=${month}`);
  const save = db.transaction(() => {
    let plan = db.prepare("SELECT id, status FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?").get(user.id, year, month) as { id: number; status: string } | undefined;
    if (!plan) {
      const id = Number(db.prepare("INSERT INTO monthly_plans (user_id, year, month, objective_id, status) VALUES (?, ?, ?, ?, 'proposed')")
        .run(user.id, year, month, strategicId).lastInsertRowid);
      plan = { id, status: "proposed" };
    }
    if (plan.status === "approved") redirect(`/monthly?year=${year}&month=${month}`);
    const sort = (db.prepare("SELECT COUNT(*) AS n FROM monthly_objectives WHERE plan_id = ?").get(plan.id) as { n: number }).n;
    const objectiveId = Number(db.prepare(
      "INSERT INTO monthly_objectives (plan_id, title, intended_outcome, priority, sort) VALUES (?, ?, ?, ?, ?)"
    ).run(plan.id, title, outcome, str(formData, "priority") === "high" ? "high" : "normal", sort).lastInsertRowid);
    db.prepare("INSERT INTO monthly_objective_strategic_links (monthly_objective_id, strategic_objective_id) VALUES (?, ?)").run(objectiveId, strategicId);
    // Keep the original reporting join in sync while the application migrates
    // from strategic-plan selections to staff-owned monthly objectives.
    db.prepare("INSERT OR IGNORE INTO monthly_plan_objectives (plan_id, objective_id) VALUES (?, ?)").run(plan.id, strategicId);
  });
  save();
  revalidatePath("/monthly");
  redirect(`/monthly?saved=objective&year=${year}&month=${month}`);
}

export async function addMonthlyFocusArea(formData: FormData) {
  const objectiveId = Number(formData.get("monthly_objective_id"));
  const title = str(formData, "title");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!title) redirect(`/monthly?year=${year}&month=${month}`);
  const db = getDb();
  const row = db.prepare("SELECT plan_id FROM monthly_objectives WHERE id = ?").get(objectiveId) as { plan_id: number } | undefined;
  if (!row) redirect("/monthly");
  await requireEditablePlan(row.plan_id);
  const sort = (db.prepare("SELECT COUNT(*) AS n FROM monthly_focus_areas WHERE monthly_objective_id = ?").get(objectiveId) as { n: number }).n;
  db.prepare("INSERT INTO monthly_focus_areas (monthly_objective_id, title, target_outcome, sort) VALUES (?, ?, ?, ?)")
    .run(objectiveId, title, str(formData, "target_outcome"), sort);
  revalidatePath("/monthly");
  redirect(`/monthly?saved=focus&year=${year}&month=${month}`);
}

export async function submitMonthlyWorkPlan(formData: FormData) {
  const planId = Number(formData.get("plan_id"));
  const user = await requireEditablePlan(planId);
  const db = getDb();
  const counts = db.prepare(
    `SELECT COUNT(*) AS objectives,
            (SELECT COUNT(*) FROM monthly_focus_areas mfa JOIN monthly_objectives mo ON mo.id = mfa.monthly_objective_id WHERE mo.plan_id = ?) AS focus_areas
     FROM monthly_objectives WHERE plan_id = ?`
  ).get(planId, planId) as { objectives: number; focus_areas: number };
  const plan = db.prepare("SELECT year, month FROM monthly_plans WHERE id = ? AND user_id = ?").get(planId, user.id) as { year: number; month: number };
  if (counts.objectives === 0 || counts.focus_areas === 0) redirect(`/monthly?error=submit&year=${plan.year}&month=${plan.month}`);
  db.prepare("UPDATE monthly_plans SET status = 'proposed', submitted_at = datetime('now'), returned_at = NULL, manager_feedback = '' WHERE id = ?")
    .run(planId);
  revalidatePath("/monthly");
  revalidatePath("/team");
  redirect(`/monthly?saved=plan&year=${plan.year}&month=${plan.month}`);
}

// ---------- weekly reports ----------

export async function saveWeeklySummary(formData: FormData) {
  const user = await requireUser();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const week = Number(formData.get("week_of_month"));
  const submit = formData.get("intent") === "submit";
  const db = getDb();
  const existing = db.prepare("SELECT status FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? AND week_of_month = ?").get(user.id, year, month, week) as { status: string } | undefined;
  if (existing?.status === "submitted" || existing?.status === "seen") redirect(`/weekly?error=locked&year=${year}&month=${month}&week=${week}`);
  reportingPeriod(year, month, week);

  // Focus selections are optional report context. Generated work sections also
  // include recurring and reactive work, which must remain reportable without
  // an approved monthly plan.
  const plan = db
    .prepare("SELECT id, status FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?")
    .get(user.id, year, month) as { id: number; status: string } | undefined;
  const planObjectives = plan?.status === "approved"
    ? (db.prepare("SELECT objective_id FROM monthly_plan_objectives WHERE plan_id = ?").all(plan.id) as { objective_id: number }[])
    : [];
  const focusRows: { focus_area_id: number }[] = plan?.status === "approved"
    ? (db.prepare("SELECT focus_area_id FROM monthly_plan_focus WHERE plan_id = ?").all(plan.id) as { focus_area_id: number }[])
    : [];
  const pool = new Set(focusRows.map((row) => row.focus_area_id));
  const focus1 = numOrNull(formData.get("focus_area_id"));
  let focus2 = numOrNull(formData.get("focus_area_2_id"));
  if (focus2 === focus1) focus2 = null;
  if ((focus1 !== null && !pool.has(focus1)) || (focus2 !== null && !pool.has(focus2))) {
    redirect(`/weekly?error=focus&year=${year}&month=${month}&week=${week}`);
  }
  const objectiveProgress = planObjectives.flatMap(({ objective_id }) => {
    const raw = formData.get(`objective_progress_${objective_id}`);
    if (raw === null) {
      const saved = db.prepare("SELECT wop.progress_percent FROM weekly_objective_progress wop JOIN weekly_summaries ws ON ws.id = wop.summary_id WHERE ws.user_id = ? AND ws.year = ? AND ws.month = ? AND ws.week_of_month = ? AND wop.objective_id = ?").get(user.id, year, month, week, objective_id) as { progress_percent: number } | undefined;
      return saved ? [{ objective_id, progress_percent: saved.progress_percent }] : [];
    }
    if (raw === "") return [];
    return [{ objective_id, progress_percent: Math.max(0, Math.min(100, Number(raw) || 0)) }];
  });
  const progress = objectiveProgress.length
    ? Math.round(objectiveProgress.reduce((sum, row) => sum + row.progress_percent, 0) / objectiveProgress.length)
    : null;
  const { start: weekStart, end: weekEnd } = reportingPeriod(year, month, week);
  const uploadedEvidence = db.prepare(
    `SELECT we.original_name
       FROM work_evidence we
       JOIN work_updates wu ON wu.id = we.work_update_id
      WHERE wu.user_id = ? AND wu.update_date BETWEEN ? AND ?
      ORDER BY we.id DESC`
  ).all(user.id, weekStart, weekEnd) as { original_name: string }[];
  const evidenceText = uploadedEvidence.map((item) => item.original_name).join("\n") || str(formData, "evidence");

  db.transaction(() => {
    const current = db.prepare("SELECT status FROM weekly_summaries WHERE user_id=? AND year=? AND month=? AND week_of_month=?").get(user.id, year, month, week) as { status: string } | undefined;
    if (current?.status === "submitted" || current?.status === "seen") redirect(`/weekly?error=locked&year=${year}&month=${month}&week=${week}`);
    db.prepare(
      `INSERT INTO weekly_summaries
       (user_id, year, month, week_of_month, focus_area_id, focus_area_2_id, tasks_completed, evidence,
        challenges, solutions, people_engaged, impact, risk_level, next_week_plan, progress_percent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, year, month, week_of_month) DO UPDATE SET
         focus_area_id = excluded.focus_area_id,
         focus_area_2_id = excluded.focus_area_2_id,
         tasks_completed = excluded.tasks_completed,
         evidence = excluded.evidence,
         challenges = excluded.challenges,
         solutions = excluded.solutions,
         people_engaged = excluded.people_engaged,
         impact = excluded.impact,
         risk_level = excluded.risk_level,
         next_week_plan = excluded.next_week_plan,
         progress_percent = excluded.progress_percent,
         status = CASE WHEN weekly_summaries.status = 'seen' AND excluded.status = 'draft'
                       THEN 'seen' ELSE excluded.status END`
    ).run(
      user.id, year, month, week, focus1, focus2,
      str(formData, "tasks_completed"), evidenceText, str(formData, "challenges"),
      str(formData, "solutions"), str(formData, "people_engaged"), str(formData, "impact"),
      String(formData.get("risk_level") ?? "Low"), str(formData, "next_week_plan"), progress,
      submit ? "submitted" : "draft"
    );
    const summary = db
      .prepare("SELECT id FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? AND week_of_month = ?")
      .get(user.id, year, month, week) as { id: number };
    db.prepare("DELETE FROM weekly_objective_progress WHERE summary_id = ?").run(summary.id);
    const insertProgress = db.prepare(
      "INSERT INTO weekly_objective_progress (summary_id, objective_id, progress_percent) VALUES (?, ?, ?)"
    );
    for (const row of objectiveProgress) insertProgress.run(summary.id, row.objective_id, row.progress_percent);
    if (submit) db.prepare("UPDATE weekly_summaries SET activity_snapshot = ?, evidence_snapshot = ? WHERE id = ?").run(JSON.stringify(weeklyDraftLive(user.id, year, month, week)), JSON.stringify(liveReportEvidence(user.id, year, month, week)), summary.id);
  })();
  revalidatePath("/weekly");
  revalidatePath("/daily");
  revalidatePath("/monthly");
  revalidatePath("/");
  redirect(`/weekly?saved=1&year=${year}&month=${month}&week=${week}`);
}

export async function commentWeeklySummary(formData: FormData) {
  // Keep the old action name, but enforce the same approval/snapshot rules.
  await approveWeeklySummary(formData);
}

export async function approveWeeklySummary(formData: FormData) {
  const user = await requireUser();
  const summaryId = Number(formData.get("summary_id"));
  const db = getDb();
  const summary = db.prepare("SELECT id, user_id, year, month, week_of_month, status FROM weekly_summaries WHERE id = ?").get(summaryId) as { id: number; user_id: number; year: number; month: number; week_of_month: number; status: string } | undefined;
  if (!summary) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, summary.user_id));
  if (!allowed) redirect("/");
  if (summary.status !== "submitted") redirect(`/team/reports/${summaryId}?error=status`);
  reportData(summary.user_id, summary.year, summary.month, summary.week_of_month);
  db.prepare("UPDATE weekly_summaries SET manager_comment = ?, status = 'seen', seen_at = datetime('now') WHERE id = ?")
    .run(str(formData, "manager_comment"), summaryId);
  revalidatePath("/team");
  revalidatePath(`/team/reports/${summaryId}`);
  redirect(`/team/reports/${summaryId}?reviewed=approved`);
}

export async function requestWeeklySummaryChanges(formData: FormData) {
  const user = await requireUser();
  const summaryId = Number(formData.get("summary_id"));
  const feedback = str(formData, "manager_comment");
  const db = getDb();
  const summary = db.prepare("SELECT id, user_id, status FROM weekly_summaries WHERE id = ?").get(summaryId) as { id: number; user_id: number; status: string } | undefined;
  if (!summary) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, summary.user_id));
  if (!allowed) redirect("/");
  if (summary.status !== "submitted") redirect(`/team/reports/${summaryId}?error=status`);
  if (!feedback) redirect(`/team/reports/${summaryId}?feedback=required`);
  db.prepare("UPDATE weekly_summaries SET manager_comment = ?, status = 'changes_requested', seen_at = datetime('now') WHERE id = ?")
    .run(feedback, summaryId);
  revalidatePath("/team");
  revalidatePath(`/team/reports/${summaryId}`);
  redirect(`/team/reports/${summaryId}?reviewed=changes`);
}

// ---------- monthly reviews ----------

export async function saveMonthlyReview(formData: FormData) {
  const user = await requireUser();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const submit = formData.get("intent") === "submit";
  const db = getDb();

  const existing = db
    .prepare("SELECT id, status FROM monthly_reviews WHERE user_id = ? AND year = ? AND month = ?")
    .get(user.id, year, month) as { id: number; status: string } | undefined;
  if (existing && existing.status === "reviewed") redirect(`/monthly?year=${year}&month=${month}`);

  const selfRating = numOrNull(formData.get("self_rating"));
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO monthly_reviews
       (user_id, year, month, strategic_objectives, objective_outcome, key_achievements, outputs_delivered,
        impact_summary, recommendations, pending_items, self_rating, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, year, month) DO UPDATE SET
         strategic_objectives = excluded.strategic_objectives,
         objective_outcome = excluded.objective_outcome,
         key_achievements = excluded.key_achievements,
         outputs_delivered = excluded.outputs_delivered,
         impact_summary = excluded.impact_summary,
         recommendations = excluded.recommendations,
         pending_items = excluded.pending_items,
         self_rating = excluded.self_rating,
         status = excluded.status`
    ).run(
      user.id,
      year,
      month,
      str(formData, "strategic_objectives"),
      str(formData, "objective_outcome"),
      str(formData, "key_achievements"),
      str(formData, "outputs_delivered"),
      str(formData, "impact_summary"),
      str(formData, "recommendations"),
      str(formData, "pending_items"),
      selfRating,
      submit ? "submitted" : "draft"
    );
    const review = db
      .prepare("SELECT id FROM monthly_reviews WHERE user_id = ? AND year = ? AND month = ?")
      .get(user.id, year, month) as { id: number };
    const upsertCommentary = db.prepare(
      `INSERT INTO monthly_commentaries (review_id, tor_area_id, commentary)
       VALUES (?, ?, ?)
       ON CONFLICT (review_id, tor_area_id) DO UPDATE SET commentary = excluded.commentary`
    );
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("tor_")) {
        upsertCommentary.run(review.id, Number(key.slice(4)), String(value).trim());
      }
    }
  });
  save();
  revalidatePath("/monthly");
  revalidatePath("/reviews");
  redirect(`/reviews?saved=1&year=${year}&month=${month}`);
}

export async function reviewMonthly(formData: FormData) {
  const user = await requireUser();
  const reviewId = Number(formData.get("review_id"));
  const db = getDb();
  const review = db
    .prepare("SELECT id, user_id FROM monthly_reviews WHERE id = ?")
    .get(reviewId) as { id: number; user_id: number } | undefined;
  if (!review) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, review.user_id));
  if (!allowed) redirect("/");
  db.prepare(
    `UPDATE monthly_reviews
     SET manager_rating = ?, manager_comments = ?, status = 'reviewed',
         reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(numOrNull(formData.get("manager_rating")), str(formData, "manager_comments"), user.id, reviewId);
  revalidatePath("/team");
  redirect(`/team/${review.user_id}?reviewed=1`);
}

// ---------- admin: users ----------

export async function createUser(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "employee");
  const managerId = numOrNull(formData.get("manager_id"));
  if (!name || !email || password.length < 6 || !["admin", "manager", "employee"].includes(role)) redirect("/admin?error=invalid");
  if (managerId) {
    const manager = getDb().prepare("SELECT role, active FROM users WHERE id = ?").get(managerId) as { role: string; active: number } | undefined;
    if (!manager || !manager.active || (manager.role !== "manager" && manager.role !== "admin")) redirect("/admin?error=reporting");
  }
  try {
    getDb()
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, job_title, manager_id, template_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        email,
        bcrypt.hashSync(password, 10),
        role,
        String(formData.get("job_title") ?? "").trim(),
        managerId,
        numOrNull(formData.get("template_id"))
      );
  } catch {
    redirect("/admin?error=email");
  }
  revalidatePath("/admin");
  redirect("/admin?saved=1");
}

export async function updateUser(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const db = getDb();
  const managerId = numOrNull(formData.get("manager_id"));
  const role = String(formData.get("role") ?? "employee");
  if (!id || !["admin", "manager", "employee"].includes(role) || managerId === id) redirect("/admin?error=reporting");
  if (managerId) {
    const manager = db.prepare("SELECT id, role, active FROM users WHERE id = ?").get(managerId) as { id: number; role: string; active: number } | undefined;
    if (!manager || !manager.active || (manager.role !== "manager" && manager.role !== "admin")) redirect("/admin?error=reporting");
    let cursor: number | null = managerId;
    const visited = new Set<number>();
    while (cursor) {
      if (visited.has(cursor)) redirect("/admin?error=reporting");
      visited.add(cursor);
      if (cursor === id) redirect("/admin?error=reporting");
      cursor = (db.prepare("SELECT manager_id FROM users WHERE id = ?").get(cursor) as { manager_id: number | null } | undefined)?.manager_id ?? null;
    }
  }
  const active = formData.get("active") === "on" ? 1 : 0;
  const newPassword = String(formData.get("new_password") ?? "");
  if (newPassword && newPassword.length < 6) redirect("/admin?error=password");
  db.transaction(() => {
    const current = db.prepare("SELECT role, active FROM users WHERE id = ?").get(id) as { role: string; active: number } | undefined;
    if (!current) redirect("/admin?error=reporting");
    if (current.role === "admin" && current.active && (role !== "admin" || !active)) {
      const count = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(id) as { n: number };
      if (!count.n) redirect("/admin?error=last_admin");
    }
    if ((!active || role === "employee") && db.prepare("SELECT 1 FROM users WHERE manager_id = ? AND active = 1").get(id)) redirect("/admin?error=reports");
  db.prepare(
    `UPDATE users SET role = ?, job_title = ?, manager_id = ?, template_id = ?, active = ? WHERE id = ?`
  ).run(
    role,
    String(formData.get("job_title") ?? "").trim(),
    managerId,
    numOrNull(formData.get("template_id")),
    formData.get("active") === "on" ? 1 : 0,
    id
  );
  if (newPassword.length >= 6) {
    db.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), id);
  }
  })();
  revalidatePath("/admin");
  redirect("/admin?saved=1");
}

// ---------- admin: templates ----------

export async function createTemplate(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/templates");
  const result = getDb()
    .prepare("INSERT INTO templates (name, description) VALUES (?, ?)")
    .run(name, String(formData.get("description") ?? "").trim());
  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${result.lastInsertRowid}`);
}

export async function duplicateTemplate(formData: FormData) {
  await requireAdmin();
  const sourceId = Number(formData.get("template_id"));
  const db = getDb();
  const source = db.prepare("SELECT name, description FROM templates WHERE id = ?").get(sourceId) as { name: string; description: string } | undefined;
  if (!source) redirect("/admin/templates");
  let name = `${source.name} (copy)`;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM templates WHERE name = ?").get(name)) name = `${source.name} (copy ${suffix++})`;
  const newId = db.transaction(() => {
    const id = Number(db.prepare("INSERT INTO templates (name, description) VALUES (?, ?)").run(name, source.description).lastInsertRowid);
    const focus = db.prepare("SELECT id, name, sort FROM focus_areas WHERE template_id = ? ORDER BY id").all(sourceId) as { id: number; name: string; sort: number }[];
    const focusMap = new Map<number, number>();
    for (const row of focus) focusMap.set(row.id, Number(db.prepare("INSERT INTO focus_areas (template_id, name, sort) VALUES (?, ?, ?)").run(id, row.name, row.sort).lastInsertRowid));
    for (const table of ["task_categories", "tor_areas", "departments"] as const) {
      const rows = db.prepare(`SELECT * FROM ${table} WHERE template_id = ? ORDER BY id`).all(sourceId) as Record<string, unknown>[];
      for (const row of rows) {
        if (table === "task_categories") db.prepare("INSERT INTO task_categories (template_id, focus_area_id, name, day_code, week_number, sort) VALUES (?, ?, ?, ?, ?, ?)").run(id, focusMap.get(Number(row.focus_area_id)) ?? null, row.name, row.day_code, row.week_number, row.sort);
        else db.prepare(`INSERT INTO ${table} (template_id, name, sort) VALUES (?, ?, ?)`).run(id, row.name, row.sort);
      }
    }
    return id;
  })();
  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${newId}`);
}

export async function addFocusArea(formData: FormData) {
  await requireAdmin();
  const templateId = Number(formData.get("template_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    getDb()
      .prepare(
        "INSERT INTO focus_areas (template_id, name, sort) SELECT ?, ?, COALESCE(MAX(sort)+1, 0) FROM focus_areas WHERE template_id = ?"
      )
      .run(templateId, name, templateId);
  }
  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}`);
}

export async function addTaskCategory(formData: FormData) {
  await requireAdmin();
  const templateId = Number(formData.get("template_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    getDb()
      .prepare(
        `INSERT INTO task_categories (template_id, focus_area_id, name, day_code, week_number, sort)
         SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sort)+1, 0) FROM task_categories WHERE template_id = ?`
      )
      .run(
        templateId,
        numOrNull(formData.get("focus_area_id")),
        name,
        String(formData.get("day_code") ?? "") || null,
        numOrNull(formData.get("week_number")),
        templateId
      );
  }
  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}`);
}

export async function addTorArea(formData: FormData) {
  await requireAdmin();
  const templateId = Number(formData.get("template_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    getDb()
      .prepare(
        "INSERT INTO tor_areas (template_id, name, sort) SELECT ?, ?, COALESCE(MAX(sort)+1, 0) FROM tor_areas WHERE template_id = ?"
      )
      .run(templateId, name, templateId);
  }
  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}`);
}

export async function addDepartment(formData: FormData) {
  await requireAdmin();
  const templateId = Number(formData.get("template_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    getDb()
      .prepare(
        "INSERT INTO departments (template_id, name, sort) SELECT ?, ?, COALESCE(MAX(sort)+1, 0) FROM departments WHERE template_id = ?"
      )
      .run(templateId, name, templateId);
  }
  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}`);
}

export async function deleteTemplateItem(formData: FormData) {
  await requireAdmin();
  const templateId = Number(formData.get("template_id"));
  const table = String(formData.get("table"));
  const id = Number(formData.get("id"));
  const allowed: Record<string, string> = {
    focus_areas: "focus_areas",
    task_categories: "task_categories",
    tor_areas: "tor_areas",
    departments: "departments",
  };
  if (allowed[table]) {
    getDb().prepare(`DELETE FROM ${allowed[table]} WHERE id = ? AND template_id = ?`).run(id, templateId);
  }
  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}`);
}

// ---------- work execution ----------

const WORK_STATUSES = new Set(["planned", "in_progress", "blocked", "completed", "deferred", "cancelled"]);
const WORK_TYPES = new Set(["planned", "recurring", "reactive"]);

export async function createWorkItem(formData: FormData) {
  const user = await requireUser();
  const title = str(formData, "title");
  const workType = str(formData, "work_type") || "planned";
  const status = str(formData, "status") || "planned";
  if (!title || !WORK_TYPES.has(workType) || !WORK_STATUSES.has(status)) redirect("/work?error=work");
  const db = getDb();
  const objectiveId = numOrNull(formData.get("objective_id"));
  const focusAreaId = numOrNull(formData.get("monthly_focus_area_id"));
  let monthlyObjectiveId: number | null = null;
  let monthlyPlanId: number | null = null;
  let linkedStrategicId = objectiveId;
  if (focusAreaId) {
    const linkedFocus = db.prepare(
      `SELECT mfa.id, mfa.monthly_objective_id, mp.id AS monthly_plan_id,
              (SELECT strategic_objective_id FROM monthly_objective_strategic_links WHERE monthly_objective_id = mo.id ORDER BY strategic_objective_id LIMIT 1) AS strategic_objective_id
       FROM monthly_focus_areas mfa
       JOIN monthly_objectives mo ON mo.id = mfa.monthly_objective_id
       JOIN monthly_plans mp ON mp.id = mo.plan_id
       WHERE mfa.id = ? AND mp.user_id = ? AND mp.status = 'approved'`
    ).get(focusAreaId, user.id) as { monthly_objective_id: number; monthly_plan_id: number; strategic_objective_id: number | null } | undefined;
    if (!linkedFocus) redirect("/work?error=objective");
    monthlyObjectiveId = linkedFocus.monthly_objective_id;
    monthlyPlanId = linkedFocus.monthly_plan_id;
    linkedStrategicId = linkedFocus.strategic_objective_id;
  }
  if (linkedStrategicId && !focusAreaId) {
    const allowed = db.prepare(
      `SELECT 1 FROM monthly_plans mp JOIN monthly_plan_objectives mpo ON mpo.plan_id = mp.id
       WHERE mp.user_id = ? AND mpo.objective_id = ? AND mp.status = 'approved'`
    ).get(user.id, objectiveId);
    if (!allowed) redirect("/work?error=objective");
  }
  const recurrence = workType === "recurring" ? str(formData, "recurrence") : "none";
  if (workType === "recurring" && !["daily", "weekdays", "weekly", "monthly"].includes(recurrence)) redirect("/work?error=schedule");
  const due = str(formData, "due_date") || (workType === "recurring" ? new Date().toISOString().slice(0, 10) : null);
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due + "T12:00:00Z")))) redirect("/work?error=date");
  db.prepare(
    `INSERT INTO work_items (user_id, monthly_plan_id, monthly_objective_id, monthly_focus_area_id, objective_id, work_type, title, description, status, due_date, recurrence, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END)`
  ).run(user.id, monthlyPlanId, monthlyObjectiveId, focusAreaId, linkedStrategicId, workType, title, str(formData, "description"), status, due, recurrence, status);
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
  redirect("/work?saved=work");
}

export async function addWorkUpdate(formData: FormData) {
  const user = await requireUser();
  const text = str(formData, "text");
  const workItemId = numOrNull(formData.get("work_item_id"));
  const status = str(formData, "status");
  if (!text) redirect("/?error=update");
  validateEvidence(formData, "/work");
  if (status && !WORK_STATUSES.has(status)) redirect("/?error=update");
  const db = getDb();
  await withEvidence(db, formData, () => {
    let itemId = workItemId;
    if (itemId) {
      const item = db.prepare("SELECT id FROM work_items WHERE id = ? AND user_id = ?").get(itemId, user.id);
      if (!item) redirect("/work");
    } else {
      // A global quick update becomes reactive work plus its first update. It
      // keeps unplanned operational effort visible without changing the plan.
      itemId = Number(db.prepare(
        `INSERT INTO work_items (user_id, work_type, title, status, completed_at)
         VALUES (?, 'reactive', ?, ?, CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END)`
      ).run(user.id, text, status || "completed", status || "completed").lastInsertRowid);
    }
    const updateId = Number(db.prepare(
      "INSERT INTO work_updates (user_id, work_item_id, update_date, text, status_after) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, itemId, str(formData, "update_date") || new Date().toISOString().slice(0, 10), text, status || null).lastInsertRowid);
    if (status) {
      db.prepare("UPDATE work_items SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?")
        .run(status, status, itemId);
      syncDailyStatus(itemId, status);
    }
    if (formData.get("blocker") === "on") {
      db.prepare(
        "INSERT INTO blockers (work_item_id, created_by, description, severity, requires_manager_attention) VALUES (?, ?, ?, ?, 1)"
      ).run(itemId, user.id, str(formData, "blocker_description") || text, str(formData, "blocker_severity") || "needs_attention");
      db.prepare("UPDATE work_items SET status = 'blocked', updated_at = datetime('now') WHERE id = ?").run(itemId);
      db.prepare("UPDATE work_updates SET status_after = 'blocked' WHERE id = ?").run(updateId);
      syncDailyStatus(itemId, "blocked");
    }
    return updateId;
  });

  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
  redirect((formData.get("return_to") === "/work" ? "/work" : "/") + "?saved=update");
}

export async function setWorkStatus(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const status = str(formData, "status");
  if (!WORK_STATUSES.has(status)) redirect("/work");
  const db = getDb();
  const change = db.prepare(
    "UPDATE work_items SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(status, status, id, user.id);
  if (change.changes > 0) {
    syncDailyStatus(id, status);
    db.prepare("INSERT INTO work_updates (user_id, work_item_id, update_date, text, status_after) VALUES (?, ?, date('now'), ?, ?)")
      .run(user.id, id, `Marked ${status.replace("_", " ")}.`, status);
  }
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
}

// ---------- helpers ----------

export async function updateFocusProgress(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("focus_id"));
  const progress = Number(formData.get("progress_percent"));
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) redirect("/monthly?error=progress");
  const db = getDb();
  const focus = db.prepare("SELECT mp.year, mp.month FROM monthly_focus_areas mfa JOIN monthly_objectives mo ON mo.id = mfa.monthly_objective_id JOIN monthly_plans mp ON mp.id = mo.plan_id WHERE mfa.id = ? AND mp.user_id = ? AND mp.status = 'approved' AND mo.archived = 0").get(id, user.id) as { year: number; month: number } | undefined;
  if (!focus) redirect("/monthly?error=progress");
  db.prepare("UPDATE monthly_focus_areas SET progress_percent = ? WHERE id = ?").run(Math.round(progress), id);
  revalidatePath("/monthly");
  revalidatePath("/reviews");
  redirect(`/monthly?year=${focus.year}&month=${focus.month}&saved=1`);
}

export async function stopRecurringWork(formData: FormData) {
  const user = await requireUser();
  const db = getDb();
  const id = Number(formData.get("id"));
  db.transaction(() => {
    const changed = db.prepare("UPDATE work_items SET recurrence = 'none' WHERE id = ? AND user_id = ?").run(id, user.id);
    if (changed.changes) db.prepare("UPDATE work_items SET status='cancelled' WHERE recurrence_parent_id=? AND user_id=? AND status='planned' AND due_date > date('now')").run(id, user.id);
  })();
  revalidatePath("/work");
}

export async function carryMonthlyObjective(formData: FormData) {
  const user = await requireUser();
  const db = getDb();
  const sourceId = Number(formData.get("source_id"));
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  reportingPeriod(year, month, 1);
  const source = db.prepare("SELECT mo.*,mp.year,mp.month FROM monthly_objectives mo JOIN monthly_plans mp ON mp.id=mo.plan_id WHERE mo.id=? AND mp.user_id=? AND mp.status='approved' AND mo.archived=0 AND (mp.year < ? OR (mp.year=? AND mp.month<?))").get(sourceId, user.id, year, year, month) as { title: string; intended_outcome: string; priority: string } | undefined;
  if (!source) redirect("/monthly?error=carry");
  const links = db.prepare("SELECT o.id FROM monthly_objective_strategic_links link JOIN objectives o ON o.id=link.strategic_objective_id WHERE link.monthly_objective_id=? AND o.active=1 AND (o.manager_id=? OR o.manager_id=?)").all(sourceId, user.manager_id ?? -1, user.id) as { id: number }[];
  if (!links.length) redirect("/monthly?error=carry");
  db.transaction(() => {
    let plan = db.prepare("SELECT id,status,submitted_at FROM monthly_plans WHERE user_id=? AND year=? AND month=?").get(user.id, year, month) as { id: number; status: string; submitted_at: string | null } | undefined;
    if (plan?.status === "approved" || plan?.submitted_at) redirect("/monthly?error=carry");
    if (!plan) plan = { id: Number(db.prepare("INSERT INTO monthly_plans(user_id,year,month,objective_id,status) VALUES(?,?,?,?,'proposed')").run(user.id, year, month, links[0].id).lastInsertRowid), status: "proposed", submitted_at: null };
    if (db.prepare("SELECT 1 FROM monthly_objectives WHERE plan_id=? AND carried_from_id=?").get(plan.id, sourceId)) return;
    const id = Number(db.prepare("INSERT INTO monthly_objectives(plan_id,title,intended_outcome,priority,carried_from_id) VALUES(?,?,?,?,?)").run(plan.id, source.title, source.intended_outcome, source.priority, sourceId).lastInsertRowid);
    for (const link of links) {
      db.prepare("INSERT INTO monthly_objective_strategic_links VALUES(?,?)").run(id, link.id);
      db.prepare("INSERT OR IGNORE INTO monthly_plan_objectives VALUES(?,?)").run(plan.id, link.id);
    }
    db.prepare("INSERT INTO monthly_focus_areas(monthly_objective_id,title,target_outcome,sort,progress_percent) SELECT ?,title,target_outcome,sort,progress_percent FROM monthly_focus_areas WHERE monthly_objective_id=?").run(id, sourceId);
  })();
  revalidatePath("/monthly");
  redirect(`/monthly?year=${year}&month=${month}&saved=carry`);
}

export async function updateTemplate(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("template_id"));
  const name = str(formData, "name");
  if (!name) redirect(`/admin/templates/${id}?error=name`);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM templates WHERE name=? AND id!=?").get(name, id)) redirect(`/admin/templates/${id}?error=name`);
  db.prepare("UPDATE templates SET name=?,description=? WHERE id=?").run(name, str(formData, "description"), id);
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${id}`);
  redirect(`/admin/templates/${id}?saved=1`);
}

function numOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return value === null || value === "" || Number.isNaN(n) ? null : n;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function validateEvidence(formData: FormData, returnTo: string) {
  const file = formData.get("evidence");
  if (!(file instanceof File) || !file.size) return;
  const types: Record<string, string[]> = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "application/pdf": [".pdf"], "application/msword": [".doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] };
  if (file.size > 10 * 1024 * 1024) redirect(returnTo + "?error=file_size");
  if (!types[file.type]?.includes(path.extname(file.name).toLowerCase())) redirect(returnTo + "?error=file_type");
}

async function withEvidence(db: ReturnType<typeof getDb>, formData: FormData, save: () => number) {
  const file = formData.get("evidence");
  let storedName = "";
  let target = "";
  if (file instanceof File && file.size > 0) {
    storedName = randomUUID() + path.extname(file.name).toLowerCase();
    const directory = path.join(process.cwd(), "data", "evidence");
    fs.mkdirSync(directory, { recursive: true });
    target = path.join(directory, storedName);
    fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
  }
  try {
    return db.transaction(() => {
      const updateId = save();
      if (storedName && file instanceof File) db.prepare("INSERT INTO work_evidence (work_update_id, original_name, stored_name, mime_type, byte_size) VALUES (?, ?, ?, ?, ?)").run(updateId, path.basename(file.name).slice(0, 180), storedName, file.type, file.size);
      return updateId;
    })();
  } catch (error) {
    if (target && fs.existsSync(target)) fs.unlinkSync(target);
    throw error;
  }
}
