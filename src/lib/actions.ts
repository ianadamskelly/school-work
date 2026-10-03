"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { createSession, destroySession, getSessionUser } from "./auth";

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
  const followupRequired = formData.get("followup_required") === "on" ? 1 : 0;
  const db = getDb();
  const logDate = String(formData.get("log_date"));
  const statusLabel = String(formData.get("status") ?? "Pending");
  const workStatus = statusLabel === "Completed" ? "completed" : statusLabel === "In Progress" ? "in_progress" : "planned";
  const requestedType = String(formData.get("work_type") ?? "planned");
  const workType = requestedType === "recurring" || requestedType === "reactive" ? requestedType : "planned";
  const focusId = numOrNull(formData.get("monthly_focus_area_id"));
  const outcome = String(formData.get("outcome") ?? "").trim();
  db.transaction(() => {
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
    db.prepare("INSERT INTO work_updates (user_id, work_item_id, update_date, text, status_after, legacy_daily_log_id) VALUES (?, ?, ?, ?, ?, ?)").run(user.id, itemId, logDate, outcome ? activity + ": " + outcome : activity, workStatus, logId);
  })();
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
  const statusLabel = String(formData.get("status"));
  const workStatus = statusLabel === "Completed" ? "completed" : statusLabel === "In Progress" ? "in_progress" : "planned";
  db.transaction(() => {
    db.prepare("UPDATE daily_logs SET status = ? WHERE id = ? AND user_id = ?").run(statusLabel, logId, user.id);
    const update = db.prepare("SELECT work_item_id FROM work_updates WHERE legacy_daily_log_id = ? AND user_id = ?").get(logId, user.id) as { work_item_id: number | null } | undefined;
    if (update?.work_item_id) {
      db.prepare("UPDATE work_updates SET status_after = ?, updated_at = datetime('now') WHERE legacy_daily_log_id = ?").run(workStatus, logId);
      db.prepare("UPDATE work_items SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(workStatus, workStatus, update.work_item_id, user.id);
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
  db.transaction(() => {
    const update = db.prepare("SELECT id, work_item_id FROM work_updates WHERE legacy_daily_log_id = ? AND user_id = ?").get(logId, user.id) as { id: number; work_item_id: number | null } | undefined;
    db.prepare("DELETE FROM daily_logs WHERE id = ? AND user_id = ?").run(logId, user.id);
    if (update) {
      db.prepare("DELETE FROM work_updates WHERE id = ?").run(update.id);
      if (update.work_item_id) {
        const remaining = db.prepare("SELECT COUNT(*) AS n FROM work_updates WHERE work_item_id = ?").get(update.work_item_id) as { n: number };
        if (remaining.n === 0) db.prepare("DELETE FROM work_items WHERE id = ? AND user_id = ?").run(update.work_item_id, user.id);
      }
    }
  })();
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
    .prepare("SELECT id, user_id, submitted_at FROM monthly_plans WHERE id = ?")
    .get(planId) as { id: number; user_id: number; submitted_at: string | null } | undefined;
  if (!plan) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, plan.user_id));
  if (!allowed) redirect("/");
  if (!plan.submitted_at) redirect(`/team/${plan.user_id}`);
  db.prepare(
    "UPDATE monthly_plans SET status = 'approved', manager_feedback = '', approved_by = ?, approved_at = datetime('now') WHERE id = ?"
  ).run(user.id, planId);
  revalidatePath("/team");
  redirect(`/team/${plan.user_id}?approved=1`);
}

export async function requestMonthlyPlanChanges(formData: FormData) {
  const user = await requireUser();
  const planId = Number(formData.get("plan_id"));
  const feedback = str(formData, "manager_feedback");
  const db = getDb();
  const plan = db.prepare("SELECT id, user_id, submitted_at FROM monthly_plans WHERE id = ?").get(planId) as { id: number; user_id: number; submitted_at: string | null } | undefined;
  if (!plan) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, plan.user_id));
  if (!allowed) redirect("/");
  if (!plan.submitted_at) redirect(`/team/${plan.user_id}`);
  if (!feedback) redirect(`/team/${plan.user_id}?feedback=required`);
  db.prepare("UPDATE monthly_plans SET status = 'proposed', manager_feedback = ?, returned_at = datetime('now'), submitted_at = NULL, approved_by = NULL, approved_at = NULL WHERE id = ?")
    .run(feedback, planId);
  revalidatePath("/team");
  redirect(`/team/${plan.user_id}?feedback=1`);
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
    if (raw === null || raw === "") return [];
    return [{ objective_id, progress_percent: Math.max(0, Math.min(100, Number(raw) || 0)) }];
  });
  const progress = objectiveProgress.length
    ? Math.round(objectiveProgress.reduce((sum, row) => sum + row.progress_percent, 0) / objectiveProgress.length)
    : null;

  db.transaction(() => {
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
      str(formData, "tasks_completed"), str(formData, "evidence"), str(formData, "challenges"),
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
  })();
  revalidatePath("/weekly");
  revalidatePath("/daily");
  revalidatePath("/monthly");
  revalidatePath("/");
  redirect(`/weekly?saved=1&year=${year}&month=${month}&week=${week}`);
}

export async function commentWeeklySummary(formData: FormData) {
  const user = await requireUser();
  const summaryId = Number(formData.get("summary_id"));
  const db = getDb();
  const summary = db
    .prepare("SELECT id, user_id FROM weekly_summaries WHERE id = ?")
    .get(summaryId) as { id: number; user_id: number } | undefined;
  if (!summary) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, summary.user_id));
  if (!allowed) redirect("/");
  db.prepare(
    "UPDATE weekly_summaries SET manager_comment = ?, status = 'seen', seen_at = datetime('now') WHERE id = ?"
  ).run(str(formData, "manager_comment"), summaryId);
  revalidatePath("/team");
  redirect(`/team/${summary.user_id}?commented=1`);
}

export async function approveWeeklySummary(formData: FormData) {
  const user = await requireUser();
  const summaryId = Number(formData.get("summary_id"));
  const db = getDb();
  const summary = db.prepare("SELECT id, user_id FROM weekly_summaries WHERE id = ?").get(summaryId) as { id: number; user_id: number } | undefined;
  if (!summary) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, summary.user_id));
  if (!allowed) redirect("/");
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
  const summary = db.prepare("SELECT id, user_id FROM weekly_summaries WHERE id = ?").get(summaryId) as { id: number; user_id: number } | undefined;
  if (!summary) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, summary.user_id));
  if (!allowed) redirect("/");
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
  if (!name || !email || password.length < 6) redirect("/admin?error=invalid");
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
        String(formData.get("role") ?? "employee"),
        String(formData.get("job_title") ?? "").trim(),
        numOrNull(formData.get("manager_id")),
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
  db.prepare(
    `UPDATE users SET role = ?, job_title = ?, manager_id = ?, template_id = ?, active = ? WHERE id = ?`
  ).run(
    String(formData.get("role") ?? "employee"),
    String(formData.get("job_title") ?? "").trim(),
    numOrNull(formData.get("manager_id")),
    numOrNull(formData.get("template_id")),
    formData.get("active") === "on" ? 1 : 0,
    id
  );
  const newPassword = String(formData.get("new_password") ?? "");
  if (newPassword.length >= 6) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), id);
  }
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
              (SELECT strategic_objective_id FROM monthly_objective_strategic_links WHERE monthly_objective_id = mo.id ORDER BY id LIMIT 1) AS strategic_objective_id
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
  db.prepare(
    `INSERT INTO work_items (user_id, monthly_plan_id, monthly_objective_id, monthly_focus_area_id, objective_id, work_type, title, description, status, due_date, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END)`
  ).run(user.id, monthlyPlanId, monthlyObjectiveId, focusAreaId, linkedStrategicId, workType, title, str(formData, "description"), status, str(formData, "due_date") || null, status);
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
  if (status && !WORK_STATUSES.has(status)) redirect("/?error=update");
  const db = getDb();
  const save = db.transaction(() => {
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
    db.prepare(
      "INSERT INTO work_updates (user_id, work_item_id, update_date, text, status_after) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, itemId, str(formData, "update_date") || new Date().toISOString().slice(0, 10), text, status || null);
    if (status) {
      db.prepare("UPDATE work_items SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END, updated_at = datetime('now') WHERE id = ?")
        .run(status, status, itemId);
    }
    if (formData.get("blocker") === "on") {
      db.prepare(
        "INSERT INTO blockers (work_item_id, created_by, description, severity, requires_manager_attention) VALUES (?, ?, ?, ?, 1)"
      ).run(itemId, user.id, str(formData, "blocker_description") || text, str(formData, "blocker_severity") || "needs_attention");
      db.prepare("UPDATE work_items SET status = 'blocked', updated_at = datetime('now') WHERE id = ?").run(itemId);
    }
  });
  save();
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
  redirect(String(formData.get("return_to") ?? "/") + "?saved=update");
}

export async function setWorkStatus(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const status = str(formData, "status");
  if (!WORK_STATUSES.has(status)) redirect("/work");
  const db = getDb();
  const change = db.prepare(
    "UPDATE work_items SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(status, status, id, user.id);
  if (change.changes > 0) {
    db.prepare("INSERT INTO work_updates (user_id, work_item_id, update_date, text, status_after) VALUES (?, ?, date('now'), ?, ?)")
      .run(user.id, id, `Marked ${status.replace("_", " ")}.`, status);
  }
  revalidatePath("/");
  revalidatePath("/work");
  revalidatePath("/weekly");
  revalidatePath("/monthly");
}

// ---------- helpers ----------

function numOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return value === null || value === "" || Number.isNaN(n) ? null : n;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
