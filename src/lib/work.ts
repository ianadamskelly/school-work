import { getDb } from "./db";

export type WorkType = "planned" | "recurring" | "reactive";
export type WorkStatus = "planned" | "in_progress" | "blocked" | "completed" | "deferred" | "cancelled";

export type WorkItem = {
  id: number;
  title: string;
  description: string;
  work_type: WorkType;
  status: WorkStatus;
  due_date: string | null;
  objective_title: string | null;
  focus_area: string | null;
  latest_update: string | null;
  open_blockers: number;
};

export type WeeklyDraftSection = {
  title: string;
  kind: "objective" | "recurring" | "reactive" | "other";
  items: { id: number; title: string; status: string | null; update: string; date: string }[];
};

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function reportingWeekStart(year: number, month: number, week: number) {
  return `${monthStart(year, month).slice(0, -2)}${String((week - 1) * 7 + 1).padStart(2, "0")}`;
}

export function listWork(userId: number, view: string, today: string): WorkItem[] {
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
  } else {
    clauses.push("wi.status NOT IN ('completed', 'cancelled')");
  }
  return db
    .prepare(
      `SELECT wi.id, wi.title, wi.description, wi.work_type, wi.status, wi.due_date,
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
  const db = getDb();
  const start = reportingWeekStart(year, month, week);
  const end = week === 4 ? `${monthStart(year, month).slice(0, -2)}31` : null;
  const rows = db
    .prepare(
      `SELECT wu.id, wu.text AS update_text, wu.update_date AS date, wi.title, wi.status, wi.work_type,
              COALESCE(mo.title, o.title) AS objective_title
       FROM work_updates wu
       LEFT JOIN work_items wi ON wi.id = wu.work_item_id
       LEFT JOIN objectives o ON o.id = wi.objective_id
       LEFT JOIN monthly_objectives mo ON mo.id = wi.monthly_objective_id
       WHERE wu.user_id = ? AND wu.update_date >= ? AND wu.update_date ${end ? "<= ?" : "< date(?, '+7 days')"}
       ORDER BY wu.update_date, wu.id`
    )
    .all(userId, start, end ?? start) as {
      id: number; update_text: string; date: string; title: string | null; status: string | null; work_type: WorkType | null; objective_title: string | null;
    }[];

  const groups = new Map<string, WeeklyDraftSection>();
  for (const row of rows) {
    const kind = row.objective_title ? "objective" : row.work_type === "recurring" ? "recurring" : row.work_type === "reactive" ? "reactive" : "other";
    const title = row.objective_title ?? (kind === "recurring" ? "Recurring responsibilities" : kind === "reactive" ? "Reactive / unplanned work" : "Other recorded work");
    const key = `${kind}:${title}`;
    if (!groups.has(key)) groups.set(key, { title, kind, items: [] });
    groups.get(key)!.items.push({ id: row.id, title: row.title ?? "Unlinked update", status: row.status, update: row.update_text, date: row.date });
  }
  return [...groups.values()];
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
