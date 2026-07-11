import { getDb } from "./db";

export type MonthlyPlan = {
  id: number;
  status: "proposed" | "approved";
  objective_id: number;
  objective_title: string;
  objective_description: string;
};

export type WeekFocus = { id: number; name: string };

export function getMonthlyPlan(userId: number, year: number, month: number): MonthlyPlan | null {
  const row = getDb()
    .prepare(
      `SELECT mp.id, mp.status, mp.objective_id, o.title AS objective_title, o.description AS objective_description
       FROM monthly_plans mp JOIN objectives o ON o.id = mp.objective_id
       WHERE mp.user_id = ? AND mp.year = ? AND mp.month = ?`
    )
    .get(userId, year, month) as MonthlyPlan | undefined;
  return row ?? null;
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
