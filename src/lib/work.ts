import { getDb } from "./db";

export type WorkType = "planned" | "recurring" | "reactive";
export type WorkStatus = "planned" | "in_progress" | "blocked" | "completed" | "deferred" | "cancelled";

export type WorkItem = {
  id: number;
  monthly_objective_id: number | null;
  title: string;
  description: string;
  work_type: WorkType;
  status: WorkStatus;
  due_date: string | null;
  recurrence: string;
  objective_title: string | null;
  focus_area: string | null;
  latest_update: string | null;
  open_blockers: number;
};

export type WeeklyDraftSection = {
  title: string;
  progress_percent?: number;
  kind: "objective" | "recurring" | "reactive" | "other";
  items: { id: number; title: string; status: string | null; update: string; date: string }[];
};

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function reportingWeekStart(year: number, month: number, week: number) {
  return `${monthStart(year, month).slice(0, -2)}${String((week - 1) * 7 + 1).padStart(2, "0")}`;
}

export function reportingPeriod(year: number, month: number, week: number) {
  if (!Number.isInteger(year) || year < 1970 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(week) || week < 1 || week > 4) throw new Error("Invalid reporting period");
  const last = new Date(year, month, 0).getDate();
  const startDay = (week - 1) * 7 + 1;
  const endDay = week === 4 ? last : Math.min(week * 7, last);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return { start: prefix + String(startDay).padStart(2, "0"), end: prefix + String(endDay).padStart(2, "0"), startDay, endDay };
}

export function listWork(userId: number, view: string, today: string): WorkItem[] {
  ensureRecurringWork(userId, today);
  const db = getDb();
  const clauses = ["wi.user_id = ?"];
  const values: (number | string)[] = [userId];
  if (view === "completed") clauses.push("wi.status = 'completed'");
  else if (view === "blocked") clauses.push("wi.status = 'blocked'");
  else if (view === "today") {
    clauses.push("wi.status NOT IN ('completed', 'cancelled')");
    clauses.push("(wi.due_date IS NULL OR wi.due_date <= ?)");
    values.push(today);
  } else if (view === "upcoming") {
    clauses.push("wi.status NOT IN ('completed', 'cancelled')");
    clauses.push("wi.due_date > ?");
    values.push(today);
  } else if (view === "week") {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const start = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 6);
    clauses.push("wi.status != 'cancelled' AND wi.due_date BETWEEN ? AND ?");
    values.push(start, date.toISOString().slice(0, 10));
  } else {
    clauses.push("wi.status NOT IN ('completed', 'cancelled')");
  }
  return db
    .prepare(
      `SELECT wi.id, wi.monthly_objective_id, wi.title, wi.description, wi.work_type, wi.status, wi.due_date, wi.recurrence,
              COALESCE(mo.title, o.title) AS objective_title, COALESCE(mfa.title, fa.name) AS focus_area,
              (SELECT wu.text FROM work_updates wu WHERE wu.work_item_id = wi.id ORDER BY wu.update_date DESC, wu.id DESC LIMIT 1) AS latest_update,
              (SELECT COUNT(*) FROM blockers b WHERE b.work_item_id = wi.id AND b.resolved = 0) AS open_blockers
       FROM work_items wi
       LEFT JOIN objectives o ON o.id = wi.objective_id
       LEFT JOIN focus_areas fa ON fa.id = wi.focus_area_id
       LEFT JOIN monthly_objectives mo ON mo.id = wi.monthly_objective_id
       LEFT JOIN monthly_focus_areas mfa ON mfa.id = wi.monthly_focus_area_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY CASE wi.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
                wi.due_date IS NULL, wi.due_date, wi.updated_at DESC`
    )
    .all(...values) as WorkItem[];
}

export function weeklyDraft(userId: number, year: number, month: number, week: number): WeeklyDraftSection[] {
  return reportData(userId, year, month, week).activity;
}

export function weeklyDraftLive(userId: number, year: number, month: number, week: number): WeeklyDraftSection[] {
  const db = getDb();
  const { start, end } = reportingPeriod(year, month, week);
  const rows = db
    .prepare(
      `SELECT wu.id, wu.text AS update_text, wu.update_date AS date, wi.title, COALESCE(wu.status_after, wi.status) AS status, wi.work_type,
              COALESCE(mo.title, o.title) AS objective_title,
              (SELECT AVG(mfa.progress_percent) FROM monthly_focus_areas mfa WHERE mfa.monthly_objective_id = mo.id) AS objective_progress
       FROM work_updates wu
       LEFT JOIN work_items wi ON wi.id = wu.work_item_id
       LEFT JOIN objectives o ON o.id = wi.objective_id
       LEFT JOIN monthly_objectives mo ON mo.id = wi.monthly_objective_id
       WHERE wu.user_id = ? AND wu.update_date BETWEEN ? AND ?
       ORDER BY wu.update_date, wu.id`
    )
    .all(userId, start, end) as {
      id: number; update_text: string; date: string; title: string | null; status: string | null; work_type: WorkType | null; objective_title: string | null; objective_progress: number | null;
    }[];

  const groups = new Map<string, WeeklyDraftSection>();
  for (const row of rows) {
    const kind = row.objective_title ? "objective" : row.work_type === "recurring" ? "recurring" : row.work_type === "reactive" ? "reactive" : "other";
    const title = row.objective_title ?? (kind === "recurring" ? "Recurring responsibilities" : kind === "reactive" ? "Reactive / unplanned work" : "Other recorded work");
    const key = `${kind}:${title}`;
    if (!groups.has(key)) groups.set(key, { title, kind, progress_percent: Math.round(row.objective_progress ?? 0), items: [] });
    groups.get(key)!.items.push({ id: row.id, title: row.title ?? "Unlinked update", status: row.status, update: row.update_text, date: row.date });
  }
  return [...groups.values()];
}

export type ReportEvidence = { id: number; original_name: string };
export function liveReportEvidence(userId: number, year: number, month: number, week: number): ReportEvidence[] {
  const { start, end } = reportingPeriod(year, month, week);
  return getDb().prepare(`SELECT we.id, we.original_name FROM work_evidence we JOIN work_updates wu ON wu.id = we.work_update_id WHERE wu.user_id = ? AND wu.update_date BETWEEN ? AND ? ORDER BY we.id DESC`).all(userId, start, end) as ReportEvidence[];
}

export function reportData(userId: number, year: number, month: number, week: number): { activity: WeeklyDraftSection[]; evidence: ReportEvidence[] } {
  const db = getDb();
  const row = db.prepare("SELECT id, status, activity_snapshot, evidence_snapshot FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? AND week_of_month = ?").get(userId, year, month, week) as { id: number; status: string; activity_snapshot: string; evidence_snapshot: string } | undefined;
  const locked = row && (row.status === "submitted" || row.status === "seen");
  if (locked && row.activity_snapshot && row.evidence_snapshot) return { activity: JSON.parse(row.activity_snapshot), evidence: JSON.parse(row.evidence_snapshot) };
  const data = { activity: weeklyDraftLive(userId, year, month, week), evidence: liveReportEvidence(userId, year, month, week) };
  // Existing reports predate snapshots. Freeze their available content once;
  // never claim this reconstructs the original historical submission.
  if (locked) db.prepare("UPDATE weekly_summaries SET activity_snapshot = ?, evidence_snapshot = ? WHERE id = ? AND activity_snapshot = ''").run(JSON.stringify(data.activity), JSON.stringify(data.evidence), row.id);
  return data;
}

export type DailyUpdate = { id: number; legacy_id: number | null; log_date: string; activity: string; outcome: string; hours: number; status: string; priority: string; category: string | null; department: string | null; work_type: WorkType | null; followup_required: number; followup_date: string | null };
export function dailyUpdates(userId: number, start: string, end: string): DailyUpdate[] {
  return getDb().prepare(`SELECT wu.id, wu.legacy_daily_log_id AS legacy_id, wu.update_date AS log_date,
    COALESCE(wi.title, dl.activity, 'Work update') AS activity, wu.text AS outcome,
    COALESCE(dl.hours, 0) AS hours, CASE COALESCE(wi.status, wu.status_after)
      WHEN 'completed' THEN 'Completed' WHEN 'in_progress' THEN 'In Progress'
      WHEN 'blocked' THEN 'Blocked' WHEN 'deferred' THEN 'Deferred' ELSE 'Pending' END AS status,
    COALESCE(dl.priority, 'Medium') AS priority, tc.name AS category, d.name AS department, wi.work_type,
    COALESCE(dl.followup_required, 0) AS followup_required, dl.followup_date
    FROM work_updates wu LEFT JOIN work_items wi ON wi.id = wu.work_item_id
    LEFT JOIN daily_logs dl ON dl.id = wu.legacy_daily_log_id
    LEFT JOIN task_categories tc ON tc.id = dl.category_id LEFT JOIN departments d ON d.id = dl.department_id
    WHERE wu.user_id = ? AND wu.update_date BETWEEN ? AND ? ORDER BY wu.update_date DESC, wu.id DESC`).all(userId, start, end) as DailyUpdate[];
}

export function syncDailyStatus(workItemId: number, status: string) {
  const label = status === "completed" ? "Completed" : status === "in_progress" ? "In Progress" : status === "blocked" ? "Blocked" : status === "deferred" ? "Deferred" : "Pending";
  getDb().prepare("UPDATE daily_logs SET status = ? WHERE id IN (SELECT legacy_daily_log_id FROM work_updates WHERE work_item_id = ?)").run(label, workItemId);
  if (status !== "blocked") getDb().prepare("UPDATE blockers SET resolved = 1 WHERE work_item_id = ? AND resolved = 0").run(workItemId);
}

// Materialize a bounded seven-day planning horizon. A unique parent/date index
// makes repeated page loads safe and each occurrence has independent status.
export function ensureRecurringWork(userId: number, today: string) {
  const db = getDb();
  const sources = db.prepare("SELECT * FROM work_items WHERE user_id = ? AND recurrence != 'none' AND recurrence_parent_id IS NULL AND status != 'cancelled'").all(userId) as { id: number; due_date: string; recurrence: string; title: string; description: string; monthly_plan_id: number | null; monthly_objective_id: number | null; monthly_focus_area_id: number | null; objective_id: number | null }[];
  const horizon = new Date(today + "T12:00:00Z"); horizon.setUTCDate(horizon.getUTCDate() + 7);
  db.transaction(() => {
    for (const source of sources) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(source.due_date ?? "")) continue;
      const origin = new Date(source.due_date + "T12:00:00Z");
      if (!Number.isFinite(origin.getTime())) continue;
      const date = new Date(origin);
      // Start near the current horizon instead of generating years of backlogs.
      const earliest = new Date(today + "T12:00:00Z"); earliest.setUTCDate(earliest.getUTCDate() - 7);
      if (date < earliest) date.setTime(earliest.getTime());
      while (date <= horizon) {
        const delta = Math.round((date.getTime() - origin.getTime()) / 86400000);
        const monthLast = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        const occurs = source.recurrence === "daily" || (source.recurrence === "weekdays" && date.getUTCDay() > 0 && date.getUTCDay() < 6) || (source.recurrence === "weekly" && delta % 7 === 0) || (source.recurrence === "monthly" && date.getUTCDate() === Math.min(origin.getUTCDate(), monthLast));
        const due = date.toISOString().slice(0, 10);
        if (occurs && due > source.due_date) db.prepare("INSERT OR IGNORE INTO work_items(user_id,monthly_plan_id,monthly_objective_id,monthly_focus_area_id,objective_id,work_type,title,description,status,due_date,recurrence_parent_id) VALUES(?,?,?,?,?,'recurring',?,?,'planned',?,?)").run(userId, source.monthly_plan_id, source.monthly_objective_id, source.monthly_focus_area_id, source.objective_id, source.title, source.description, due, source.id);
        date.setUTCDate(date.getUTCDate() + 1);
      }
    }
  })();
}

export function workStats(userId: number, start: string, end: string) {
  return getDb()
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status IN ('planned','in_progress') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
        COUNT(*) AS total
       FROM work_items WHERE user_id = ? AND (due_date IS NULL OR (due_date >= ? AND due_date <= ?))`
    )
    .get(userId, start, end) as { completed: number; active: number; blocked: number; total: number };
}
