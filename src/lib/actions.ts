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
  getDb()
    .prepare(
      `INSERT INTO daily_logs
       (user_id, log_date, category_id, activity, department_id, hours, outcome,
        followup_required, followup_date, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      String(formData.get("log_date")),
      numOrNull(formData.get("category_id")),
      activity,
      numOrNull(formData.get("department_id")),
      Number(formData.get("hours") ?? 0) || 0,
      String(formData.get("outcome") ?? "").trim(),
      followupRequired,
      followupRequired ? String(formData.get("followup_date") ?? "") || null : null,
      String(formData.get("priority") ?? "Medium"),
      String(formData.get("status") ?? "Pending")
    );
  revalidatePath("/daily");
  revalidatePath("/");
  redirect("/daily?saved=1");
}

export async function setDailyStatus(formData: FormData) {
  const user = await requireUser();
  getDb()
    .prepare("UPDATE daily_logs SET status = ? WHERE id = ? AND user_id = ?")
    .run(String(formData.get("status")), Number(formData.get("id")), user.id);
  revalidatePath("/daily");
  revalidatePath("/");
}

export async function deleteDailyLog(formData: FormData) {
  const user = await requireUser();
  getDb()
    .prepare("DELETE FROM daily_logs WHERE id = ? AND user_id = ?")
    .run(Number(formData.get("id")), user.id);
  revalidatePath("/daily");
  revalidatePath("/");
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
    .prepare("SELECT id, user_id FROM monthly_plans WHERE id = ?")
    .get(planId) as { id: number; user_id: number } | undefined;
  if (!plan) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, plan.user_id));
  if (!allowed) redirect("/");
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
  const plan = db.prepare("SELECT id, user_id FROM monthly_plans WHERE id = ?").get(planId) as { id: number; user_id: number } | undefined;
  if (!plan) redirect("/team");
  const allowed = user.role === "admin" || (user.role === "manager" && isDirectReport(user.id, plan.user_id));
  if (!allowed) redirect("/");
  if (!feedback) redirect(`/team/${plan.user_id}?feedback=required`);
  db.prepare("UPDATE monthly_plans SET status = 'proposed', manager_feedback = ?, approved_by = NULL, approved_at = NULL WHERE id = ?")
    .run(feedback, planId);
  revalidatePath("/team");
  redirect(`/team/${plan.user_id}?feedback=1`);
}

// ---------- weekly reports ----------

export async function saveWeeklySummary(formData: FormData) {
  const user = await requireUser();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const week = Number(formData.get("week_of_month"));
  const submit = formData.get("intent") === "submit";
  const db = getDb();

  // Focus areas must come from the approved monthly plan's pool.
  const plan = db
    .prepare("SELECT id, status FROM monthly_plans WHERE user_id = ? AND year = ? AND month = ?")
    .get(user.id, year, month) as { id: number; status: string } | undefined;
  if (!plan || plan.status !== "approved") {
    redirect(`/weekly?error=noplan&year=${year}&month=${month}&week=${week}`);
  }
  const planObjectives = db
    .prepare("SELECT objective_id FROM monthly_plan_objectives WHERE plan_id = ?")
    .all(plan.id) as { objective_id: number }[];
  const pool = new Set(
    (db.prepare("SELECT focus_area_id FROM monthly_plan_focus WHERE plan_id = ?").all(plan.id) as
      { focus_area_id: number }[]).map((r) => r.focus_area_id)
  );
  const focus1 = numOrNull(formData.get("focus_area_id"));
  let focus2 = numOrNull(formData.get("focus_area_2_id"));
  if (focus2 === focus1) focus2 = null;
  if (!focus1 || !pool.has(focus1) || (focus2 !== null && !pool.has(focus2))) {
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
  redirect(`/monthly?saved=1&year=${year}&month=${month}`);
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

// ---------- helpers ----------

function numOrNull(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return value === null || value === "" || Number.isNaN(n) ? null : n;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
