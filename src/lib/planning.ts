import { getDb } from "./db";

export type MonthlyWorkObjective = {
  id: number;
  title: string;
  intended_outcome: string;
  priority: "normal" | "high";
  strategic_titles: string;
  focus_areas: { id: number; title: string; target_outcome: string; work_total: number; completed_work: number }[];
};

export function getMonthlyWorkObjectives(planId: number): MonthlyWorkObjective[] {
  const db = getDb();
  const objectives = db.prepare(
    `SELECT mo.id, mo.title, mo.intended_outcome, mo.priority,
            COALESCE(group_concat(so.title, ' · '), '') AS strategic_titles
     FROM monthly_objectives mo
     LEFT JOIN monthly_objective_strategic_links mosl ON mosl.monthly_objective_id = mo.id
     LEFT JOIN objectives so ON so.id = mosl.strategic_objective_id
     WHERE mo.plan_id = ?
     GROUP BY mo.id ORDER BY mo.sort, mo.id`
  ).all(planId) as Omit<MonthlyWorkObjective, "focus_areas">[];
  const focus = db.prepare(
    `SELECT mfa.id, mfa.monthly_objective_id, mfa.title, mfa.target_outcome,
            COUNT(wi.id) AS work_total,
            COALESCE(SUM(CASE WHEN wi.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_work
     FROM monthly_focus_areas mfa
     LEFT JOIN work_items wi ON wi.monthly_focus_area_id = mfa.id AND wi.status != 'cancelled'
     WHERE mfa.monthly_objective_id IN (SELECT id FROM monthly_objectives WHERE plan_id = ?)
     GROUP BY mfa.id ORDER BY mfa.sort, mfa.id`
  ).all(planId) as (MonthlyWorkObjective["focus_areas"][number] & { monthly_objective_id: number })[];
  return objectives.map((objective) => ({
    ...objective,
    focus_areas: focus.filter((area) => area.monthly_objective_id === objective.id),
  }));
}
