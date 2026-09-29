import { getDb } from "./db";

export type MonthlyPlan = {
  id: number;
  status: "proposed" | "approved";
  manager_feedback: string;
  submitted_at: string | null;
  returned_at: string | null;
};

export type WeekFocus = { id: number; name: string };
export type MonthlyObjective = { id: number; title: string; description: string };

export function getMonthlyPlan(userId: number, year: number, month: number): MonthlyPlan | null {
  const row = getDb()
    .prepare(
      `SELECT mp.id, mp.status, mp.manager_feedback, mp.submitted_at, mp.returned_at
       FROM monthly_plans mp
       WHERE mp.user_id = ? AND mp.year = ? AND mp.month = ?`
    )
    .get(userId, year, month) as MonthlyPlan | undefined;
  return row ?? null;
}

export function getPlanObjectives(planId: number): MonthlyObjective[] {
  return getDb()
    .prepare(
      `SELECT o.id, o.title, o.description FROM monthly_plan_objectives mpo
       JOIN objectives o ON o.id = mpo.objective_id
       WHERE mpo.plan_id = ? ORDER BY o.title`
    )
    .all(planId) as MonthlyObjective[];
}

export function getPlanFocusPool(planId: number): WeekFocus[] {
  return getDb()
    .prepare(
      `SELECT fa.id, fa.name FROM monthly_plan_focus mpf
       JOIN focus_areas fa ON fa.id = mpf.focus_area_id
       WHERE mpf.plan_id = ? ORDER BY fa.sort`
    )
    .all(planId) as WeekFocus[];
}

// The focus areas chosen on the weekly report row for this week (0, 1 or 2).
export function getWeekFocus(userId: number, year: number, month: number, week: number): WeekFocus[] {
  const row = getDb()
    .prepare(
      `SELECT ws.focus_area_id AS f1, ws.focus_area_2_id AS f2
       FROM weekly_summaries ws
       WHERE ws.user_id = ? AND ws.year = ? AND ws.month = ? AND ws.week_of_month = ?`
    )
    .get(userId, year, month, week) as { f1: number | null; f2: number | null } | undefined;
  if (!row) return [];
  const ids = [row.f1, row.f2].filter((v): v is number => v !== null);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT id, name FROM focus_areas WHERE id IN (${placeholders}) ORDER BY sort`)
    .all(...ids) as WeekFocus[];
}
