import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { addMonthlyFocusArea, addMonthlyWorkObjective, saveMonthlyReview, submitMonthlyWorkPlan } from "@/lib/actions";
import { MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyPlan } from "@/lib/plan";
import { getMonthlyWorkObjectives } from "@/lib/planning";
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
  const workObjectives = plan ? getMonthlyWorkObjectives(plan.id) : [];

  // Objectives this person may pick from: their line manager's list (or their own if they manage).
  const objectives = db
    .prepare(
      "SELECT id, title, description FROM objectives WHERE active = 1 AND (manager_id = ? OR manager_id = ?) ORDER BY title"
    )
    .all(user.manager_id ?? -1, user.id) as Objective[];

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

  // The review is built from the same work updates used by the weekly draft.
  const monthStats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM work_updates WHERE user_id = ? AND update_date >= ? AND update_date <= ?) AS entries,
        (SELECT COUNT(*) FROM work_items WHERE user_id = ? AND created_at >= ? AND created_at <= datetime(?, '+1 day')) AS work_items,
        (SELECT COUNT(*) FROM work_items WHERE user_id = ? AND status = 'completed' AND completed_at >= ? AND completed_at <= datetime(?, '+1 day')) AS completed`
    )
    .get(
      user.id,
      `${year}-${String(month).padStart(2, "0")}-01`,
      `${year}-${String(month).padStart(2, "0")}-31`,
      user.id,
      `${year}-${String(month).padStart(2, "0")}-01`,
      `${year}-${String(month).padStart(2, "0")}-31`,
      user.id,
      `${year}-${String(month).padStart(2, "0")}-01`,
      `${year}-${String(month).padStart(2, "0")}-31`
    ) as { entries: number; work_items: number; completed: number };
  const weekReports = db
    .prepare(
      "SELECT week_of_month, status, progress_percent FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? ORDER BY week_of_month"
    )
    .all(user.id, year, month) as { week_of_month: number; status: string; progress_percent: number | null }[];
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
      {(params.error === "plan" || params.error === "objective" || params.error === "submit") && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Add at least one monthly objective with an intended outcome and focus area before submitting.
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <Link href={`/monthly?year=${prev.y}&month=${prev.m}`} className={btnSecondary}>← {MONTH_NAMES[prev.m - 1]}</Link>
          <p className="text-lg font-semibold text-slate-900">{MONTH_NAMES[month - 1]} {year}</p>
          <Link href={`/monthly?year=${next.y}&month=${next.m}`} className={btnSecondary}>{MONTH_NAMES[next.m - 1]} →</Link>
        </div>
      </Card>

      <Card title="Monthly objectives">
        {plan && <div className="mb-4 flex flex-wrap gap-2"><Badge tone={plan.status === "approved" ? "green" : plan.submitted_at ? "blue" : "amber"}>{plan.status === "approved" ? "Approved" : plan.submitted_at ? "Waiting for manager approval" : "Draft"}</Badge></div>}
        {plan?.manager_feedback && !plan.submitted_at && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span className="font-medium">Manager feedback:</span> {plan.manager_feedback}</div>}
        <div className="space-y-4">
          {workObjectives.map((objective) => <div key={objective.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{objective.title}</p>{objective.priority === "high" && <Badge tone="amber">High priority</Badge>}</div><p className="mt-1 text-sm text-slate-600">{objective.intended_outcome}</p><p className="mt-2 text-xs text-slate-500">Strategic alignment: {objective.strategic_titles}</p><div className="mt-3 space-y-2">{objective.focus_areas.map((focus) => <div key={focus.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-700"><Badge tone="blue">Focus</Badge><span>{focus.title}</span><span className="text-xs text-slate-500">{focus.completed_work} of {focus.work_total} work items complete</span></div>)}</div>{plan?.status !== "approved" && <form action={addMonthlyFocusArea} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="monthly_objective_id" value={objective.id} /><input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={month} /><input name="title" required className={`${inputCls} max-w-sm`} placeholder="Add a focus area" /><button type="submit" className={btnSecondary}>Add focus</button></form>}</div>)}
        </div>
        {plan?.status !== "approved" && <div className="mt-5 border-t border-slate-100 pt-5">{objectives.length === 0 ? <p className="text-sm text-slate-500">Your manager needs to create strategic priorities before you can plan this month.</p> : <form action={addMonthlyWorkObjective} className="grid grid-cols-1 gap-3 sm:grid-cols-2"><input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={month} /><Field label="Monthly objective"><input name="title" required className={inputCls} placeholder="Meaningful outcome for this month" /></Field><Field label="Strategic alignment"><select name="strategic_objective_id" required defaultValue="" className={inputCls}><option value="" disabled>— Choose —</option>{objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Intended outcome"><textarea name="intended_outcome" required rows={2} className={inputCls} placeholder="How will you know this objective has progressed?" /></Field></div><Field label="Priority"><select name="priority" defaultValue="normal" className={inputCls}><option value="normal">Normal</option><option value="high">High</option></select></Field><div className="flex items-end"><button type="submit" className={btnPrimary}>Add objective</button></div></form>}</div>}
        {plan && plan.status !== "approved" && workObjectives.length > 0 && <form action={submitMonthlyWorkPlan} className="mt-5"><input type="hidden" name="plan_id" value={plan.id} /><button type="submit" className={btnPrimary}>Submit plan for approval</button></form>}
      </Card>

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
                <p className="text-2xl font-semibold text-slate-900">{monthStats.work_items}</p>
                <p className="text-xs text-slate-500">work items created</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-900">{monthStats.completed}</p>
                <p className="text-xs text-slate-500">completed this month</p>
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
              {workObjectives.map((objective) => (
                <div key={objective.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-sm font-medium text-slate-800">{objective.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{objective.focus_areas.length === 0 ? "No focus areas linked yet" : objective.focus_areas.map((area) => `${area.title}: ${area.completed_work} of ${area.work_total}`).join(" · ")}</p>
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
              <input type="hidden" name="strategic_objectives" value={workObjectives.map((objective) => objective.title).join("; ")} />
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
