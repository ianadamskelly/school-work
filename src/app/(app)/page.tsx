import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { addWorkUpdate } from "@/lib/actions";
import { reportingWeekStart, listWork, weeklyDraft, workStats } from "@/lib/work";
import { weekOfMonth, todayISO, MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyPlan, getPlanObjectives } from "@/lib/plan";
import { Card, Badge, SavedNotice, inputCls, btnPrimary } from "@/components/ui";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const db = getDb();
  const now = new Date();
  const today = todayISO();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const week = weekOfMonth(now);
  const plan = user.template_id ? getMonthlyPlan(user.id, year, month) : null;
  const objectives = plan ? getPlanObjectives(plan.id) : [];
  const work = listWork(user.id, "today", today).slice(0, 6);
  const draft = weeklyDraft(user.id, year, month, week);
  const stats = workStats(user.id, reportingWeekStart(year, month, week), week === 4 ? `${year}-${String(month).padStart(2, "0")}-31` : `${year}-${String(month).padStart(2, "0")}-${String(week * 7).padStart(2, "0")}`);
  const recentUpdates = db.prepare(
    `SELECT wu.id, wu.update_date, wu.text, wi.title AS work_title
     FROM work_updates wu LEFT JOIN work_items wi ON wi.id = wu.work_item_id
     WHERE wu.user_id = ? ORDER BY wu.update_date DESC, wu.id DESC LIMIT 5`
  ).all(user.id) as { id: number; update_date: string; text: string; work_title: string | null }[];
  const currentItems = listWork(user.id, "week", today).slice(0, 40);
  const team = user.role === "manager" || user.role === "admin"
    ? db.prepare("SELECT COUNT(*) AS n FROM users WHERE manager_id = ? AND active = 1").get(user.id) as { n: number }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Good morning, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-600">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      <SavedNotice show={params.saved === "update"} text="Update recorded — it is now part of this week’s report draft." />
      {params.error === "update" && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">Write a short update before saving.</div>}

      <Card title="Quick update">
        <p className="mb-3 text-sm text-slate-600">Capture the work once. Your weekly and monthly reports reuse it automatically.</p>
        <form action={addWorkUpdate} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_15rem_10rem_auto]">
          <input type="hidden" name="return_to" value="/" />
          <textarea name="text" required rows={2} className={inputCls} placeholder="What did you work on?" />
          <select name="work_item_id" defaultValue="" className={inputCls}>
            <option value="">New reactive work</option>
            {currentItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <select name="status" defaultValue="in_progress" className={inputCls}>
            <option value="in_progress">In progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option>
          </select>
          <button type="submit" className={btnPrimary}>Add update</button>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card title={`Today${work.length ? ` · ${work.length}` : ""}`}>
            {work.length === 0 ? <p className="text-sm text-slate-500">No work needs attention today. <Link href="/work" className="font-medium text-navy-600 underline">View all work</Link></p> : (
              <ul className="divide-y divide-slate-100">
                {work.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{item.title}</p>{item.objective_title && <p className="text-xs text-slate-500">{item.objective_title}</p>}</div><Badge tone={item.status === "blocked" ? "red" : item.status === "completed" ? "green" : "blue"}>{item.status.replace("_", " ")}</Badge></li>)}
              </ul>
            )}
          </Card>
          <Card title="Recent activity">
            {recentUpdates.length === 0 ? <p className="text-sm text-slate-500">Your latest updates will appear here.</p> : <ul className="space-y-3">{recentUpdates.map((update) => <li key={update.id}><p className="text-sm text-slate-800">{update.text}</p><p className="mt-0.5 text-xs text-slate-500">{update.work_title ?? "Reactive work"} · {update.update_date}</p></li>)}</ul>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="This week"><div className="grid grid-cols-3 gap-2 text-center"><div><p className="text-2xl font-semibold text-emerald-700">{stats.completed ?? 0}</p><p className="text-xs text-slate-500">complete</p></div><div><p className="text-2xl font-semibold text-navy-700">{stats.active ?? 0}</p><p className="text-xs text-slate-500">active</p></div><div><p className="text-2xl font-semibold text-red-600">{stats.blocked ?? 0}</p><p className="text-xs text-slate-500">blocked</p></div></div></Card>
          <Card title="Your objectives">
            {!plan ? <p className="text-sm text-slate-500">Set a monthly plan to connect planned work to your priorities. <Link href="/monthly" className="font-medium text-navy-600 underline">Plan {MONTH_NAMES[month - 1]}</Link></p> : <div className="space-y-2">{objectives.map((objective) => <p key={objective.id} className="text-sm font-medium text-slate-800">{objective.title}</p>)}</div>}
          </Card>
          <Card title="Weekly report"><p className="text-sm text-slate-600">Your draft is being built from {draft.reduce((total, section) => total + section.items.length, 0)} update{draft.reduce((total, section) => total + section.items.length, 0) === 1 ? "" : "s"} this week.</p><Link href="/weekly" className={`${btnPrimary} mt-3 w-full`}>Review draft</Link></Card>
        </div>
      </div>
      {team && <Card title="Your team"><div className="flex items-center justify-between gap-3 text-sm text-slate-600"><span>{team.n} direct report{team.n === 1 ? "" : "s"}</span><Link href="/team" className="font-medium text-navy-600 hover:underline">Open team overview →</Link></div></Card>}
    </div>
  );
}
