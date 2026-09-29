import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { saveWeeklySummary } from "@/lib/actions";
import { weekOfMonth, MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyPlan, getPlanFocusPool, getPlanObjectives } from "@/lib/plan";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

type Summary = {
  id: number;
  focus_area_id: number | null;
  focus_area_2_id: number | null;
  tasks_completed: string;
  evidence: string;
  challenges: string;
  solutions: string;
  people_engaged: string;
  impact: string;
  risk_level: string;
  next_week_plan: string;
  progress_percent: number | null;
  status: string;
  manager_comment: string;
};
type DailyEvidence = { id: number; log_date: string; activity: string; outcome: string; hours: number; status: string; category: string | null };

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; year?: string; month?: string; week?: string }>;
}) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const db = getDb();
  const now = new Date();

  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;
  const week = Number(params.week) || weekOfMonth(now);

  const plan = getMonthlyPlan(user.id, year, month);
  const pool = plan && plan.status === "approved" ? getPlanFocusPool(plan.id) : [];
  const objectives = plan ? getPlanObjectives(plan.id) : [];

  const existing = db
    .prepare("SELECT * FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? AND week_of_month = ?")
    .get(user.id, year, month, week) as Summary | undefined;

  const weekRows = db
    .prepare("SELECT week_of_month, status FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ?")
    .all(user.id, year, month) as { week_of_month: number; status: string }[];
  const existingObjectiveProgress = existing
    ? new Map(
        (db.prepare("SELECT objective_id, progress_percent FROM weekly_objective_progress WHERE summary_id = ?").all(existing.id) as
          { objective_id: number; progress_percent: number }[]).map((row) => [row.objective_id, row.progress_percent])
      )
    : new Map<number, number>();
  const weekStart = `${year}-${String(month).padStart(2, "0")}-${String((week - 1) * 7 + 1).padStart(2, "0")}`;
  const weekEnd = week === 4 ? `${year}-${String(month).padStart(2, "0")}-31` : null;
  const dailyEvidence = db
    .prepare(
      `SELECT dl.id, dl.log_date, dl.activity, dl.outcome, dl.hours, dl.status, tc.name AS category
       FROM daily_logs dl LEFT JOIN task_categories tc ON tc.id = dl.category_id
       WHERE dl.user_id = ? AND dl.log_date >= ? AND dl.log_date ${weekEnd ? "<= ?" : "< date(?, '+7 days')"}
       ORDER BY dl.log_date, dl.id`
    )
    .all(user.id, weekStart, weekEnd ?? weekStart) as DailyEvidence[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My week"
        subtitle="Compile your daily work into a focused weekly report, then show progress against each approved objective."
      />
      <SavedNotice show={params.saved === "1"} text="Your weekly report has been saved." />
      {params.error === "focus" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Choose at least one focus area — it must come from your monthly plan.
        </div>
      )}
      {params.error === "noplan" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Your monthly plan is not approved yet, so the week cannot be saved.
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            {MONTH_NAMES[month - 1]} {year} —
          </span>
          {[1, 2, 3, 4].map((w) => {
            const row = weekRows.find((r) => r.week_of_month === w);
            return (
              <Link
                key={w}
                href={`/weekly?year=${year}&month=${month}&week=${w}`}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  w === week
                    ? "bg-navy-700 text-white"
                    : row
                      ? row.status === "draft"
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                        : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Week {w}
                {row ? (row.status === "draft" ? " · draft" : " ✓") : ""}
              </Link>
            );
          })}
        </div>
      </Card>

      {!plan || plan.status !== "approved" ? (
        <Card title="Plan the month first">
          <p className="text-sm text-slate-600">
            {!plan
              ? "You have not set strategic objectives for this month yet. The weekly report follows the monthly plan."
              : "Your monthly plan is waiting for your manager's approval. Once approved, you can plan and report your weeks."}
          </p>
          <Link href={`/monthly?year=${year}&month=${month}`} className={`${btnPrimary} mt-4`}>
            Go to my monthly plan
          </Link>
        </Card>
      ) : (
        <>
          <Card>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This month&apos;s approved objectives</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {objectives.map((objective) => <Badge key={objective.id} tone="blue">{objective.title}</Badge>)}
            </div>
          </Card>

          {existing?.status === "seen" && (
            <Card title="Your manager's comment on this week">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {existing.manager_comment || "Seen — no comment left."}
              </p>
            </Card>
          )}

          <Card title={`Week ${week} report`}>
            {existing && (
              <div className="mb-4">
                <Badge tone={existing.status === "seen" ? "green" : existing.status === "submitted" ? "blue" : "amber"}>
                  {existing.status === "seen"
                    ? "Seen by your manager"
                    : existing.status === "submitted"
                      ? "Submitted — with your manager"
                      : "Draft"}
                </Badge>
              </div>
            )}
            <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">Daily work to compile</p>
              {dailyEvidence.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">No daily entries for this week yet. You can still write the report, but logging work first makes the summary more reliable.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-200">
                  {dailyEvidence.map((entry) => (
                    <li key={entry.id} className="py-2 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">{entry.log_date}</span>
                        {entry.category && <Badge tone="blue">{entry.category}</Badge>}
                        <Badge tone={entry.status === "Completed" ? "green" : "amber"}>{entry.status}</Badge>
                        <span className="text-xs text-slate-500">{entry.hours} h</span>
                      </div>
                      <p className="mt-1">{entry.activity}</p>
                      {entry.outcome && <p className="mt-1 text-slate-500">{entry.outcome}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form action={saveWeeklySummary} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="week_of_month" value={week} />
              <Field label="Focus area 1" hint="From your monthly plan.">
                <select name="focus_area_id" required defaultValue={existing?.focus_area_id ?? ""} className={inputCls}>
                  <option value="" disabled>— Choose —</option>
                  {pool.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Focus area 2 (optional)">
                <select name="focus_area_2_id" defaultValue={existing?.focus_area_2_id ?? ""} className={inputCls}>
                  <option value="">— None —</option>
                  {pool.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Major tasks completed">
                  <textarea name="tasks_completed" rows={3} defaultValue={existing?.tasks_completed} className={inputCls} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Evidence / outputs" hint="Links to documents, reports produced, minutes, photos — anything that shows the work.">
                  <textarea name="evidence" rows={2} defaultValue={existing?.evidence} className={inputCls} />
                </Field>
              </div>
              <Field label="Challenges identified">
                <textarea name="challenges" rows={3} defaultValue={existing?.challenges} className={inputCls} />
              </Field>
              <Field label="Solutions proposed">
                <textarea name="solutions" rows={3} defaultValue={existing?.solutions} className={inputCls} />
              </Field>
              <Field label="People engaged">
                <input name="people_engaged" defaultValue={existing?.people_engaged} className={inputCls} placeholder="e.g. SMT, PYP coordinators, parents" />
              </Field>
              <Field label="Risk level this week">
                <select name="risk_level" defaultValue={existing?.risk_level ?? "Low"} className={inputCls}>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </Field>
              <Field label="Impact summary">
                <input name="impact" defaultValue={existing?.impact} className={inputCls} />
              </Field>
              <div className="sm:col-span-2 rounded-lg border border-navy-100 bg-navy-50 p-4">
                <p className="text-sm font-semibold text-navy-800">Progress toward each objective</p>
                <p className="mt-1 text-xs text-slate-600">Use the daily work above as evidence. The monthly view will show the latest percentage for every objective.</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {objectives.map((objective) => (
                    <Field key={objective.id} label={objective.title}>
                      <div className="flex items-center gap-2">
                        <input name={`objective_progress_${objective.id}`} type="number" min={0} max={100} step={5}
                          defaultValue={existingObjectiveProgress.get(objective.id) ?? ""} className={inputCls} />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    </Field>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Field label="Plan for next week">
                  <textarea name="next_week_plan" rows={2} defaultValue={existing?.next_week_plan} className={inputCls} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <button type="submit" name="intent" value="draft" className={btnSecondary}>
                  Save as draft
                </button>
                <button type="submit" name="intent" value="submit" className={btnPrimary}>
                  Send report to my manager
                </button>
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
