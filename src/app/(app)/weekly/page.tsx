import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { saveWeeklySummary } from "@/lib/actions";
import { weeklyDraft } from "@/lib/work";
import { weekOfMonth, MONTH_NAMES } from "@/lib/rotation";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

type Summary = { tasks_completed: string; challenges: string; next_week_plan: string; status: string; manager_comment: string };

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ saved?: string; year?: string; month?: string; week?: string }> }) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;
  const week = Number(params.week) || weekOfMonth(now);
  const db = getDb();
  const draft = weeklyDraft(user.id, year, month, week);
  const existing = db.prepare("SELECT tasks_completed, challenges, next_week_plan, status, manager_comment FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? AND week_of_month = ?")
    .get(user.id, year, month, week) as Summary | undefined;
  const rows = db.prepare("SELECT week_of_month, status FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ?").all(user.id, year, month) as { week_of_month: number; status: string }[];
  const updateCount = draft.reduce((total, section) => total + section.items.length, 0);
  const locked = existing?.status === "submitted" || existing?.status === "seen";

  return (
    <div className="space-y-6">
      <PageHeader title="Weekly report" subtitle="Review the report built from your work updates. Add only the reflection and priorities that the activity cannot know." />
      <SavedNotice show={params.saved === "1"} text="Weekly report saved." />
      <Card>
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-700">{MONTH_NAMES[month - 1]} {year}</span>{[1, 2, 3, 4].map((value) => { const row = rows.find((item) => item.week_of_month === value); return <Link key={value} href={`/weekly?year=${year}&month=${month}&week=${value}`} className={`rounded-lg px-3 py-1.5 text-sm ${value === week ? "bg-navy-700 text-white" : row ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>Week {value}</Link>; })}</div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[1.65fr_0.8fr]">
        <div className="space-y-4">
          <Card title="Generated from your work">
            <p className="mb-4 text-sm text-slate-600">{updateCount === 0 ? "No updates were recorded for this week yet." : `${updateCount} update${updateCount === 1 ? "" : "s"} grouped from your work activity.`}</p>
            {draft.length === 0 ? <Link href="/work" className={btnPrimary}>Log work</Link> : <div className="space-y-4">{draft.map((section) => <div key={`${section.kind}-${section.title}`} className="rounded-lg border border-slate-200 p-4"><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-800">{section.title}</h2><Badge tone={section.kind === "reactive" ? "amber" : section.kind === "recurring" ? "blue" : "green"}>{section.kind === "objective" ? "objective work" : section.kind}</Badge></div><ul className="mt-3 space-y-3">{section.items.map((item) => <li key={item.id}><p className="text-sm font-medium text-slate-800">{item.title}</p><p className="text-sm text-slate-600">{item.update}</p><p className="mt-0.5 text-xs text-slate-500">{item.date}{item.status ? ` · ${item.status.replace("_", " ")}` : ""}</p></li>)}</ul></div>)}</div>}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Report details">
            {existing && <Badge tone={existing.status === "seen" ? "green" : existing.status === "submitted" ? "blue" : "amber"}>{existing.status === "seen" ? "Reviewed" : existing.status === "submitted" ? "Submitted" : "Draft"}</Badge>}
            <form action={saveWeeklySummary} className="mt-4 space-y-4">
              <input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={month} /><input type="hidden" name="week_of_month" value={week} />
              <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
                <Field label="What was significant this week?"><textarea name="tasks_completed" rows={4} defaultValue={existing?.tasks_completed} className={inputCls} placeholder="Add context the activity log cannot capture." /></Field>
                <Field label="Support or decisions needed"><textarea name="challenges" rows={3} defaultValue={existing?.challenges} className={inputCls} placeholder="Optional" /></Field>
                <Field label="Next week’s priorities"><textarea name="next_week_plan" rows={3} defaultValue={existing?.next_week_plan} className={inputCls} placeholder="What should happen next?" /></Field>
                {!locked && <div className="space-y-2"><button type="submit" name="intent" value="draft" className={`${btnSecondary} w-full`}>Save draft</button><button type="submit" name="intent" value="submit" className={`${btnPrimary} w-full`}>Submit to manager</button></div>}
              </fieldset>
            </form>
            {existing?.manager_comment && <div className="mt-4 rounded-lg bg-navy-50 p-3 text-sm text-navy-800"><span className="font-medium">Manager comment:</span> {existing.manager_comment}</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
