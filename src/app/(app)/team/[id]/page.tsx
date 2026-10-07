import Link from "next/link";
import { dailyUpdates } from "@/lib/work";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { reviewMonthly, approveMonthlyPlan, requestMonthlyPlanChanges } from "@/lib/actions";
import { todayISO, MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyWorkObjectives } from "@/lib/planning";
import { Card, Field, Badge, SavedNotice, inputCls, btnPrimary } from "@/components/ui";

type Person = { id: number; name: string; job_title: string; manager_id: number | null; template_id: number | null };
type PlanRow = { id: number; year: number; month: number; status: string; manager_feedback: string; submitted_at: string | null };
type LogRow = { id: number; log_date: string; activity: string; category: string | null; hours: number; status: string; followup_required: number; followup_date: string | null };
type WeekRow = {
  id: number; year: number; month: number; week_of_month: number;
  focus_1: string | null; focus_2: string | null;
  tasks_completed: string; evidence: string; challenges: string; solutions: string;
  impact: string; risk_level: string; next_week_plan: string;
  progress_percent: number | null; status: string; manager_comment: string;
};
type ReviewRow = {
  id: number; year: number; month: number; status: string; self_rating: number | null;
  strategic_objectives: string; objective_outcome: string;
  key_achievements: string; outputs_delivered: string; impact_summary: string;
  recommendations: string; pending_items: string;
  manager_rating: number | null; manager_comments: string;
};

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reviewed?: string; approved?: string; commented?: string; feedback?: string; year?: string; month?: string }>;
}) {
  const user = await requireSessionUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();

  const person = db
    .prepare("SELECT id, name, job_title, manager_id, template_id FROM users WHERE id = ? AND active = 1")
    .get(Number(id)) as Person | undefined;
  if (!person) notFound();
  if (user.role === "manager" && person.manager_id !== user.id) redirect("/team");

  const today = todayISO();
  const now = new Date();
  const year = Number(query.year) >= 1970 && Number(query.year) <= 9999 ? Number(query.year) : now.getFullYear();
  const month = Number(query.month) >= 1 && Number(query.month) <= 12 ? Number(query.month) : now.getMonth() + 1;

  const currentPlan = db
    .prepare(
      `SELECT mp.id, mp.year, mp.month, mp.status, mp.manager_feedback, mp.submitted_at
       FROM monthly_plans mp
       WHERE mp.user_id = ? AND mp.year = ? AND mp.month = ?`
    )
    .get(person.id, year, month) as PlanRow | undefined;
  const planObjectives = currentPlan ? getMonthlyWorkObjectives(currentPlan.id) : [];

  const weeks = db
    .prepare(
      `SELECT ws.id, ws.year, ws.month, ws.week_of_month,
              f1.name AS focus_1, f2.name AS focus_2,
              ws.tasks_completed, ws.evidence, ws.challenges, ws.solutions, ws.impact,
              ws.risk_level, ws.next_week_plan, ws.progress_percent, ws.status, ws.manager_comment
       FROM weekly_summaries ws
       LEFT JOIN focus_areas f1 ON f1.id = ws.focus_area_id
       LEFT JOIN focus_areas f2 ON f2.id = ws.focus_area_2_id
       WHERE ws.user_id = ? ORDER BY ws.year DESC, ws.month DESC, ws.week_of_month DESC LIMIT 8`
    )
    .all(person.id) as WeekRow[];

  const reviews = db
    .prepare("SELECT * FROM monthly_reviews WHERE user_id = ? ORDER BY year DESC, month DESC LIMIT 12")
    .all(person.id) as ReviewRow[];

  const torCommentaries = (reviewId: number) =>
    db
      .prepare(
        `SELECT ta.name, mc.commentary FROM monthly_commentaries mc
         JOIN tor_areas ta ON ta.id = mc.tor_area_id
         WHERE mc.review_id = ? AND mc.commentary != '' ORDER BY ta.sort`
      )
      .all(reviewId) as { name: string; commentary: string }[];

  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const logs = dailyUpdates(person.id, prefix + "-01", prefix + "-" + String(new Date(year, month, 0).getDate())).slice(0, 15);

 const isOverdue = (l: LogRow) =>
   l.followup_required === 1 && l.status !== "Completed" && !!l.followup_date && l.followup_date < today;
  const completedLogs = logs.filter((log) => log.status === "Completed").length;
  const submittedWeeks = weeks.filter((week) => week.status !== "draft").length;
  const progressWeeks = weeks.filter((week) => week.progress_percent != null);
  const averageProgress = progressWeeks.length ? Math.round(progressWeeks.reduce((total, week) => total + (week.progress_percent || 0), 0) / progressWeeks.length) : null;

 return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-2xl font-bold text-blue-700">{person.name.charAt(0)}</span><div><Link href="/team" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to team</Link><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{person.name}</h1><p className="mt-1 text-base text-slate-500">{person.job_title || "Team member"} · monthly planning, weekly reporting and review</p></div></div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-right"><p className="text-sm font-semibold text-emerald-800">{currentPlan?.status === "approved" ? "Plan approved" : currentPlan?.submitted_at ? "Plan awaiting review" : "Planning in progress"}</p><p className="mt-1 text-xs text-emerald-700">{MONTH_NAMES[month - 1]} {year}</p></div>
      </div>
      <form className="flex flex-wrap items-end gap-2"><label className="text-xs text-slate-500">Reporting year<input name="year" type="number" min="1970" max="9999" defaultValue={year} className="block w-24 rounded-lg border border-slate-200 p-2" /></label><label className="text-xs text-slate-500">Month<select name="month" defaultValue={month} className="block rounded-lg border border-slate-200 p-2">{MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">View month</button></form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-xs font-medium text-slate-500">Monthly objectives</p><p className="mt-1 text-2xl font-bold text-slate-950">{planObjectives.length}</p><p className="mt-1 text-xs text-blue-600">Current plan</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-xs font-medium text-slate-500">Weekly reports</p><p className="mt-1 text-2xl font-bold text-slate-950">{submittedWeeks}</p><p className="mt-1 text-xs text-violet-600">Recent submissions</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-xs font-medium text-slate-500">Daily work complete</p><p className="mt-1 text-2xl font-bold text-slate-950">{completedLogs}/{logs.length}</p><p className="mt-1 text-xs text-emerald-600">Latest activity</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-xs font-medium text-slate-500">Reported progress</p><p className="mt-1 text-2xl font-bold text-slate-950">{averageProgress == null ? "—" : averageProgress + "%"}</p><p className="mt-1 text-xs text-amber-600">From weekly reports</p></div>
      </div>
      <SavedNotice show={query.approved === "1"} text="Plan approved — their planned work can now be linked to its focus areas." />
      <SavedNotice show={query.feedback === "1"} text="Feedback sent — they can revise and resubmit their plan." />
      <SavedNotice show={query.commented === "1"} text="Comment saved — the weekly report is marked as seen." />
      <SavedNotice show={query.reviewed === "1"} text="Review saved — the staff member can now see your feedback." />

      <Card title={`${MONTH_NAMES[month - 1]} plan`}>
        {!currentPlan ? (
          <p className="text-sm text-slate-500">No plan proposed for this month yet.</p>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={currentPlan.status === "approved" ? "green" : currentPlan.submitted_at ? "amber" : "slate"}>
                {currentPlan.status === "approved" ? "Approved" : currentPlan.submitted_at ? "Waiting for your approval" : "Staff draft"}
              </Badge>
            </div>
            <div className="mt-2 space-y-1">
              {planObjectives.map((objective) => <div key={objective.id}><p className="font-semibold text-navy-800">{objective.title}</p><p className="text-sm text-slate-600">{objective.intended_outcome}</p><div className="mt-1 flex flex-wrap gap-2">{objective.focus_areas.map((focus) => <Badge key={focus.id} tone="blue">{focus.title}</Badge>)}</div></div>)}
            </div>
            {currentPlan.status === "proposed" && currentPlan.submitted_at && (
              <div className="mt-4 space-y-3">
                <form action={approveMonthlyPlan}>
                  <input type="hidden" name="plan_id" value={currentPlan.id} />
                  <button type="submit" className={btnPrimary}>Approve this plan</button>
                </form>
                <form action={requestMonthlyPlanChanges} className="rounded-lg bg-amber-50 p-3">
                  <input type="hidden" name="plan_id" value={currentPlan.id} />
                  <Field label="Feedback for revision">
                    <textarea name="manager_feedback" required rows={2} className={inputCls} placeholder="Explain what should change before approval" />
                  </Field>
                  <button type="submit" className="mt-2 rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 cursor-pointer">
                    Send feedback for revision
                  </button>
                </form>
              </div>
            )}
            {currentPlan.status === "proposed" && !currentPlan.submitted_at && <p className="mt-3 text-sm text-slate-500">This is still a staff draft. It will appear in your approval queue after it is submitted.</p>}
          </div>
        )}
      </Card>

      <Card title="Weekly reports">
        {weeks.length === 0 ? (
          <p className="text-sm text-slate-500">No weekly reports yet.</p>
        ) : (
          <div className="space-y-4">
            {weeks.map((w) => (
              <div key={w.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {MONTH_NAMES[w.month - 1]} {w.year}, week {w.week_of_month}
                  </span>
                  {w.focus_1 && <Badge tone="blue">{w.focus_1}</Badge>}
                  {w.focus_2 && <Badge tone="blue">{w.focus_2}</Badge>}
                  <Badge tone={w.risk_level === "High" ? "red" : w.risk_level === "Medium" ? "amber" : "green"}>
                    {w.risk_level} risk
                  </Badge>
                  {w.progress_percent != null && <Badge tone="green">{w.progress_percent}% progress</Badge>}
                  <Badge tone={w.status === "seen" ? "green" : w.status === "submitted" ? "blue" : "slate"}>
                    {w.status === "seen" ? "Seen" : w.status === "submitted" ? "New — needs reading" : "Draft"}
                  </Badge>
                </div>
                {w.status !== "draft" && (
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {w.tasks_completed && <p><span className="font-medium">Done:</span> {w.tasks_completed}</p>}
                    {w.evidence && <p><span className="font-medium">Evidence:</span> {w.evidence}</p>}
                    {w.challenges && <p><span className="font-medium">Challenges:</span> {w.challenges}</p>}
                    {w.solutions && <p><span className="font-medium">Solutions:</span> {w.solutions}</p>}
                    {w.next_week_plan && <p><span className="font-medium">Next week:</span> {w.next_week_plan}</p>}
                  </div>
                )}
                {w.status === "submitted" && (
                  <Link href={`/team/reports/${w.id}`} className="mt-3 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Review report
                  </Link>
                )}
                {w.status === "seen" && w.manager_comment && (
                  <p className="mt-2 text-sm text-slate-600"><span className="font-medium">Your comment:</span> {w.manager_comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Monthly reviews">
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">No monthly reviews yet.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{MONTH_NAMES[r.month - 1]} {r.year}</p>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === "reviewed" ? "green" : r.status === "submitted" ? "blue" : "slate"}>
                      {r.status === "reviewed" ? "Reviewed" : r.status === "submitted" ? "Needs your review" : "Draft"}
                    </Badge>
                    {r.self_rating != null && <Badge>Self-rating {r.self_rating}/5</Badge>}
                    {r.manager_rating != null && <Badge tone="green">Your rating {r.manager_rating}/5</Badge>}
                  </div>
                </div>

                {(r.status === "submitted" || r.status === "reviewed") && (
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {r.strategic_objectives && (
                      <p><span className="font-medium">Objective:</span> {r.strategic_objectives}</p>
                    )}
                    {r.objective_outcome && (
                      <p><span className="font-medium">Outcome:</span> {r.objective_outcome}</p>
                    )}
                    {r.key_achievements && <p><span className="font-medium">Achievements:</span> {r.key_achievements}</p>}
                    {torCommentaries(r.id).map((c) => (
                      <p key={c.name}><span className="font-medium">{c.name}:</span> {c.commentary}</p>
                    ))}
                    {r.outputs_delivered && <p><span className="font-medium">Outputs:</span> {r.outputs_delivered}</p>}
                    {r.pending_items && <p><span className="font-medium">Pending:</span> {r.pending_items}</p>}
                  </div>
                )}

                {r.status === "submitted" && (
                  <form action={reviewMonthly} className="mt-4 space-y-3 rounded-lg bg-navy-50 p-4">
                    <input type="hidden" name="review_id" value={r.id} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                      <Field label="Your rating (1–5)">
                        <select name="manager_rating" required defaultValue="" className={inputCls}>
                          <option value="" disabled>—</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Your comments">
                        <textarea name="manager_comments" rows={2} className={inputCls} placeholder="Feedback for this month" />
                      </Field>
                    </div>
                    <button type="submit" className={btnPrimary}>Sign off this month</button>
                  </form>
                )}

                {r.status === "reviewed" && r.manager_comments && (
                  <p className="mt-2 text-sm text-slate-600"><span className="font-medium">Your comments:</span> {r.manager_comments}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Recent daily entries">
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">No daily entries yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="text-xs text-slate-500">{l.log_date}</span>
                {l.category && <Badge tone="blue">{l.category}</Badge>}
                <span className="flex-1 text-slate-800">{l.activity}</span>
                <span className="text-xs text-slate-400">{l.hours} h</span>
                <Badge tone={l.status === "Completed" ? "green" : "slate"}>{l.status}</Badge>
                {isOverdue(l) && <Badge tone="red">Overdue</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
