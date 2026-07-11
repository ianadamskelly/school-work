import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { saveWeeklySummary } from "@/lib/actions";
import { weekOfMonth, MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyPlan, getPlanFocusPool } from "@/lib/plan";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

type Summary = {
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

  const existing = db
    .prepare("SELECT * FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? AND week_of_month = ?")
    .get(user.id, year, month, week) as Summary | undefined;

  const weekRows = db
    .prepare("SELECT week_of_month, status FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ?")
    .all(user.id, year, month) as { week_of_month: number; status: string }[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My week"
        subtitle="Pick up to two focus areas from your monthly plan, then report the week to your line manager."
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
              ? "You have not set a strategic objective for this month yet. The weekly report follows the monthly plan."
              : "Your monthly plan is waiting for your manager's approval. Once approved, you can plan and report your weeks."}
          </p>
          <Link href={`/monthly?year=${year}&month=${month}`} className={`${btnPrimary} mt-4`}>
            Go to my monthly plan
          </Link>
        </Card>
      ) : (
        <>
          <Card>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This month&apos;s objective</p>
            <p className="mt-1 font-semibold text-navy-800">{plan.objective_title}</p>
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
              <Field label="Objective progress (%)" hint="Your honest estimate of how far the monthly objective has come, 0–100.">
                <input
                  name="progress_percent"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  defaultValue={existing?.progress_percent ?? ""}
                  className={inputCls}
                />
              </Field>
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
