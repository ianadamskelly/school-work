import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { reviewMonthly } from "@/lib/actions";
import { todayISO, MONTH_NAMES } from "@/lib/rotation";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary } from "@/components/ui";

type Person = { id: number; name: string; job_title: string; manager_id: number | null; template_id: number | null };
type LogRow = { id: number; log_date: string; activity: string; category: string | null; hours: number; status: string; followup_required: number; followup_date: string | null };
type WeekRow = { id: number; year: number; month: number; week_of_month: number; focus_area: string | null; tasks_completed: string; challenges: string; risk_level: string };
type ReviewRow = {
  id: number; year: number; month: number; status: string; self_rating: number | null;
  key_achievements: string; outputs_delivered: string; impact_summary: string;
  recommendations: string; pending_items: string; strategic_objectives: string;
  manager_rating: number | null; manager_comments: string;
};

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reviewed?: string }>;
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
  const logs = db
    .prepare(
      `SELECT dl.id, dl.log_date, dl.activity, tc.name AS category, dl.hours, dl.status, dl.followup_required, dl.followup_date
       FROM daily_logs dl LEFT JOIN task_categories tc ON tc.id = dl.category_id
       WHERE dl.user_id = ? ORDER BY dl.log_date DESC, dl.id DESC LIMIT 15`
    )
    .all(person.id) as LogRow[];

  const weeks = db
    .prepare(
      `SELECT ws.id, ws.year, ws.month, ws.week_of_month, fa.name AS focus_area, ws.tasks_completed, ws.challenges, ws.risk_level
       FROM weekly_summaries ws LEFT JOIN focus_areas fa ON fa.id = ws.focus_area_id
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

  const isOverdue = (l: LogRow) =>
    l.followup_required === 1 && l.status !== "Completed" && !!l.followup_date && l.followup_date < today;

  return (
    <div className="space-y-6">
      <PageHeader title={person.name} subtitle={person.job_title || undefined} />
      <SavedNotice show={query.reviewed === "1"} text="Review saved — the staff member can now see your feedback." />

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

      <Card title="Recent weekly summaries">
        {weeks.length === 0 ? (
          <p className="text-sm text-slate-500">No weekly summaries yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {weeks.map((w) => (
              <li key={w.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {MONTH_NAMES[w.month - 1]} {w.year}, week {w.week_of_month}
                  </span>
                  {w.focus_area && <Badge tone="blue">{w.focus_area}</Badge>}
                  <Badge tone={w.risk_level === "High" ? "red" : w.risk_level === "Medium" ? "amber" : "green"}>
                    {w.risk_level} risk
                  </Badge>
                </div>
                {w.tasks_completed && <p className="mt-1 text-sm text-slate-600">{w.tasks_completed}</p>}
                {w.challenges && <p className="text-sm text-slate-500">Challenges: {w.challenges}</p>}
              </li>
            ))}
          </ul>
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
