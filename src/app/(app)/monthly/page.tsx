import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { saveMonthlyReview, proposeMonthlyPlan } from "@/lib/actions";
import { MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyPlan, getPlanFocusPool, getPlanObjectives } from "@/lib/plan";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

type TorArea = { id: number; name: string };
type Objective = { id: number; title: string; description: string };
type Review = {
  id: number;
  strategic_objectives: string;
  objective_outcome: string;
  key_achievements: string;
  outputs_delivered: string;
  impact_summary: string;
  recommendations: string;
  pending_items: string;
  self_rating: number | null;
  status: "draft" | "submitted" | "reviewed";
  manager_rating: number | null;
  manager_comments: string;
};

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; year?: string; month?: string }>;
}) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const db = getDb();
  const now = new Date();

  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const plan = getMonthlyPlan(user.id, year, month);
  const pool = plan ? getPlanFocusPool(plan.id) : [];
  const planObjectives = plan ? getPlanObjectives(plan.id) : [];

  // Objectives this person may pick from: their line manager's list (or their own if they manage).
  const objectives = db
    .prepare(
      "SELECT id, title, description FROM objectives WHERE active = 1 AND (manager_id = ? OR manager_id = ?) ORDER BY title"
    )
    .all(user.manager_id ?? -1, user.id) as Objective[];

  const focusAreas = user.template_id
    ? (db.prepare("SELECT id, name FROM focus_areas WHERE template_id = ? ORDER BY sort").all(user.template_id) as
        { id: number; name: string }[])
    : [];

  const torAreas = user.template_id
    ? (db.prepare("SELECT id, name FROM tor_areas WHERE template_id = ? ORDER BY sort").all(user.template_id) as TorArea[])
    : [];

  const review = db
    .prepare("SELECT * FROM monthly_reviews WHERE user_id = ? AND year = ? AND month = ?")
    .get(user.id, year, month) as Review | undefined;

  const commentaries = new Map<number, string>();
  if (review) {
    const rows = db
      .prepare("SELECT tor_area_id, commentary FROM monthly_commentaries WHERE review_id = ?")
      .all(review.id) as { tor_area_id: number; commentary: string }[];
    rows.forEach((r) => commentaries.set(r.tor_area_id, r.commentary));
  }

  // Evidence assembled from the month's activity, to write the report against.
  const monthStats = db
    .prepare(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(hours),0) AS hours
       FROM daily_logs WHERE user_id = ? AND log_date >= ? AND log_date <= ?`
    )
    .get(
      user.id,
      `${year}-${String(month).padStart(2, "0")}-01`,
      `${year}-${String(month).padStart(2, "0")}-31`
    ) as { entries: number; hours: number };
  const weekReports = db
    .prepare(
      "SELECT week_of_month, status, progress_percent FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? ORDER BY week_of_month"
    )
    .all(user.id, year, month) as { week_of_month: number; status: string; progress_percent: number | null }[];
  const latestProgress = [...weekReports].reverse().find((w) => w.progress_percent !== null)?.progress_percent;
  const objectiveProgress = plan
    ? (db
        .prepare(
          `SELECT o.id, o.title, wop.progress_percent
           FROM monthly_plan_objectives mpo
           JOIN objectives o ON o.id = mpo.objective_id
           LEFT JOIN weekly_objective_progress wop ON wop.objective_id = o.id
             AND wop.summary_id = (
               SELECT ws.id FROM weekly_summaries ws
               WHERE ws.user_id = ? AND ws.year = ? AND ws.month = ?
               ORDER BY ws.week_of_month DESC LIMIT 1
             )
           WHERE mpo.plan_id = ? ORDER BY o.title`
        )
        .all(user.id, year, month, plan.id) as { id: number; title: string; progress_percent: number | null }[])
    : [];

  const locked = review?.status === "reviewed";
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My month"
        subtitle="Plan the month around complementary strategic objectives, then track how daily work advances each one."
      />
      <SavedNotice show={params.saved === "plan"} text="Your plan has been sent to your line manager for approval." />
      <SavedNotice show={params.saved === "1"} text="Your monthly report has been saved." />
      {params.error === "plan" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Pick an objective and at least one focus area for the month.
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <Link href={`/monthly?year=${prev.y}&month=${prev.m}`} className={btnSecondary}>← {MONTH_NAMES[prev.m - 1]}</Link>
          <p className="text-lg font-semibold text-slate-900">{MONTH_NAMES[month - 1]} {year}</p>
          <Link href={`/monthly?year=${next.y}&month=${next.m}`} className={btnSecondary}>{MONTH_NAMES[next.m - 1]} →</Link>
        </div>
      </Card>

      {/* ---- Step 1: the plan ---- */}
      {plan ? (
        <Card title="This month's plan">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={plan.status === "approved" ? "green" : "amber"}>
              {plan.status === "approved" ? "Approved by your manager" : "Waiting for manager approval"}
            </Badge>
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Approved objectives</p>
          <div className="mt-2 space-y-2">
            {planObjectives.map((objective) => (
              <div key={objective.id}>
                <p className="font-semibold text-navy-800">{objective.title}</p>
                {objective.description && <p className="text-sm text-slate-600">{objective.description}</p>}
              </div>
            ))}
          </div>
          {plan.status === "proposed" && plan.manager_feedback && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-medium">Your manager&apos;s feedback:</span> {plan.manager_feedback}
            </div>
          )}
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Focus areas serving these objectives</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {pool.map((f) => (
              <Badge key={f.id} tone="blue">{f.name}</Badge>
            ))}
          </div>
          {plan.status === "proposed" && (
            <p className="mt-3 text-sm text-slate-500">
              You can revise the objectives, focus areas, and resubmit. Resubmitting clears the feedback and sends the updated plan back for approval.
            </p>
          )}
        </Card>
      ) : (
        <Card title="Set your plan for this month">
          <p className="mb-4 text-sm text-slate-600">
            Choose one or more complementary objectives your work this month will feed, and tick the focus areas that serve them.
            Your line manager will approve the plan.
          </p>
        </Card>
      )}

      {(!plan || plan.status === "proposed") && user.template_id && (
        <Card title={plan ? "Change the proposed plan" : "Propose your plan"}>
          {objectives.length === 0 ? (
            <p className="text-sm text-slate-600">
              Your line manager has not created any strategic objectives yet — ask them to add some under My team → Objectives.
            </p>
          ) : (
            <form action={proposeMonthlyPlan} className="space-y-4">
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Strategic objectives</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {objectives.map((o) => (
                    <label key={o.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <input type="checkbox" name="objective_ids" value={o.id}
                        defaultChecked={planObjectives.some((selected) => selected.id === o.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                      <span><span className="font-medium">{o.title}</span>{o.description && <span className="mt-0.5 block text-xs text-slate-500">{o.description}</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Focus areas that will serve it this month</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {focusAreas.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name="focus_ids"
                        value={f.id}
                        defaultChecked={pool.some((p) => p.id === f.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className={btnPrimary}>
                {plan ? "Resubmit plan for approval" : "Send plan to my manager"}
              </button>
            </form>
          )}
        </Card>
      )}

      {/* ---- Step 2: the report ---- */}
      {plan?.status === "approved" && (
        <>
          <Card title="The month so far">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-900">{monthStats.entries}</p>
                <p className="text-xs text-slate-500">daily entries</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{Number(monthStats.hours).toFixed(1)}</p>
                <p className="text-xs text-slate-500">hours logged</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{latestProgress != null ? `${latestProgress}%` : "—"}</p>
                <p className="text-xs text-slate-500">objective progress (latest weekly report)</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((w) => {
                const r = weekReports.find((x) => x.week_of_month === w);
                return (
                  <Badge key={w} tone={r ? (r.status === "draft" ? "amber" : "green") : "slate"}>
                    Week {w}: {r ? (r.status === "draft" ? "draft" : "reported") : "no report"}
                  </Badge>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {objectiveProgress.map((objective) => (
                <div key={objective.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-sm font-medium text-slate-800">{objective.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {objective.progress_percent == null ? "No progress estimate yet" : `${objective.progress_percent}% progress`}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {locked && review && (
            <Card title="Your manager's feedback">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Manager rating:</span> {review.manager_rating ?? "—"} / 5
              </p>
              {review.manager_comments && (
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{review.manager_comments}</p>
              )}
            </Card>
          )}

          <Card title={locked ? "Your report (locked after review)" : "End-of-month report"}>
            {review && (
              <div className="mb-4">
                <Badge tone={review.status === "reviewed" ? "green" : review.status === "submitted" ? "blue" : "slate"}>
                  {review.status === "reviewed" ? "Reviewed" : review.status === "submitted" ? "Submitted — waiting for review" : "Draft"}
                </Badge>
              </div>
            )}
            <form action={saveMonthlyReview} className="space-y-4">
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="strategic_objectives" value={planObjectives.map((objective) => objective.title).join("; ")} />
              <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
                <Field
                  label="What was achieved across this month’s objectives?"
                  hint="Use the objective progress figures above, then explain what was achieved, what remains, and what you learned."
                >
                  <textarea name="objective_outcome" rows={3} defaultValue={review?.objective_outcome} className={inputCls} />
                </Field>
                <Field label="Key achievements">
                  <textarea name="key_achievements" rows={2} defaultValue={review?.key_achievements} className={inputCls} />
                </Field>

                {torAreas.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-sm font-semibold text-slate-800">Commentary by TOR area</p>
                    <div className="space-y-3">
                      {torAreas.map((t) => (
                        <Field key={t.id} label={t.name}>
                          <textarea name={`tor_${t.id}`} rows={2} defaultValue={commentaries.get(t.id) ?? ""} className={inputCls} />
                        </Field>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Outputs delivered">
                    <textarea name="outputs_delivered" rows={2} defaultValue={review?.outputs_delivered} className={inputCls} />
                  </Field>
                  <Field label="Impact on school performance">
                    <textarea name="impact_summary" rows={2} defaultValue={review?.impact_summary} className={inputCls} />
                  </Field>
                  <Field label="Recommendations to SMT">
                    <textarea name="recommendations" rows={2} defaultValue={review?.recommendations} className={inputCls} />
                  </Field>
                  <Field label="Pending items (carry to next month)">
                    <textarea name="pending_items" rows={2} defaultValue={review?.pending_items} className={inputCls} />
                  </Field>
                </div>

                <Field label="Self-rating for the month" hint="1 = well below expectations, 5 = outstanding">
                  <select name="self_rating" defaultValue={review?.self_rating ?? ""} className={`${inputCls} max-w-40`}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </Field>

                {!locked && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button type="submit" name="intent" value="draft" className={btnSecondary}>
                      Save as draft
                    </button>
                    <button type="submit" name="intent" value="submit" className={btnPrimary}>
                      Submit to my line manager
                    </button>
                  </div>
                )}
              </fieldset>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
