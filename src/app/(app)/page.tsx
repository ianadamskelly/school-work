import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { addWorkUpdate } from "@/lib/actions";
import { reportingWeekStart, listWork, weeklyDraft, workStats } from "@/lib/work";
import { weekOfMonth, todayISO, MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyPlan, getPlanObjectives } from "@/lib/plan";
import { getMonthlyWorkObjectives } from "@/lib/planning";
import { SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

function Glyph({ name, className = "" }: { name: "check" | "clock" | "alert" | "file" | "people" | "sun" | "paperclip" | "plus" | "arrow"; className?: string }) {
  const paths = {
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5M12 16h.01" /></>,
    file: <><path d="M7 3h7l3 3v15H7z" /><path d="M14 3v4h4M10 12h4M10 16h4" /></>,
    people: <><circle cx="9" cy="9" r="3" /><circle cx="16" cy="10" r="2.5" /><path d="M3.5 20c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5M14 15c3 0 5 1.7 5.5 5" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
    paperclip: <path d="m8 12 5.6-5.6a3 3 0 1 1 4.2 4.2l-7.1 7.1a4.5 4.5 0 1 1-6.4-6.4l6.7-6.7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_5px_rgba(15,23,42,0.025)] ${className}`}>{children}</section>;
}

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
  const legacyObjectives = plan ? getPlanObjectives(plan.id) : [];
  const monthlyObjectives = plan ? getMonthlyWorkObjectives(plan.id) : [];
  const work = listWork(user.id, "today", today).slice(0, 3);
  const draft = weeklyDraft(user.id, year, month, week);
  const stats = workStats(user.id, reportingWeekStart(year, month, week), week === 4 ? `${year}-${String(month).padStart(2, "0")}-31` : `${year}-${String(month).padStart(2, "0")}-${String(week * 7).padStart(2, "0")}`);
  const recentUpdates = db.prepare(`SELECT wu.id, wu.update_date, wu.text, wi.title AS work_title FROM work_updates wu LEFT JOIN work_items wi ON wi.id = wu.work_item_id WHERE wu.user_id = ? ORDER BY wu.update_date DESC, wu.id DESC LIMIT 4`).all(user.id) as { id: number; update_date: string; text: string; work_title: string | null }[];
  const currentItems = listWork(user.id, "week", today).slice(0, 40);
  const totalWeek = (stats.completed ?? 0) + (stats.active ?? 0) + (stats.blocked ?? 0);
  const percent = totalWeek ? Math.round(((stats.completed ?? 0) / totalWeek) * 100) : 0;
  const objectiveCards = monthlyObjectives.length > 0
    ? monthlyObjectives.slice(0, 3).map((objective) => { const total = objective.focus_areas.reduce((sum, area) => sum + area.work_total, 0); const completed = objective.focus_areas.reduce((sum, area) => sum + area.completed_work, 0); return { id: objective.id, title: objective.title, description: objective.intended_outcome, percent: total ? Math.round((completed / total) * 100) : 0 }; })
    : legacyObjectives.slice(0, 3).map((objective) => ({ id: objective.id, title: objective.title, description: objective.description, percent: 0 }));

  return <div className="space-y-4 xl:space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4 pt-1"><div><h1 className="text-[38px] font-bold leading-none tracking-[-0.045em] text-slate-950 sm:text-[42px]">Good morning, {user.name.split(" ")[0]}</h1><p className="mt-2 text-[17px] text-slate-500">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div><div className="hidden items-center gap-3 rounded-xl bg-slate-100 px-5 py-3 text-sm italic text-slate-500 lg:flex"><Glyph name="sun" className="h-7 w-7 text-amber-500" />“Small steps make big progress.”</div></div>
    <SavedNotice show={params.saved === "update"} text="Update recorded — it is now part of this week’s report draft." />
    {params.error === "update" && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Write a short update before saving.</div>}
    <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
      <Panel><div className="p-5"><h2 className="text-xl font-bold tracking-tight text-slate-950">Quick Update</h2><p className="mt-1 text-sm text-slate-500">Log what you worked on, link to a task, and add evidence.</p><form action={addWorkUpdate} className="mt-4"><input type="hidden" name="return_to" value="/" /><textarea name="text" required rows={3} className={`${inputCls} min-h-[78px] resize-none`} placeholder="What did you work on?" /><div className="mt-3 grid gap-2 sm:grid-cols-[1.35fr_1fr_1fr_auto]"><label className="text-xs font-medium text-slate-600">Link to task<select name="work_item_id" defaultValue="" className={`${inputCls} mt-1`}><option value="">New reactive work</option>{currentItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="text-xs font-medium text-slate-600">Add evidence<div className="mt-1 flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-normal text-slate-500"><Glyph name="paperclip" className="h-4 w-4" />Coming soon</div></div><label className="text-xs font-medium text-slate-600">Status<select name="status" defaultValue="in_progress" className={`${inputCls} mt-1`}><option value="in_progress">● In progress</option><option value="completed">● Completed</option><option value="blocked">● Blocked</option></select></label><button type="submit" className={`${btnPrimary} mt-[19px] whitespace-nowrap`}>Add update</button></div></form></div></Panel>
      <Panel><div className="p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight text-slate-950">This Week</h2><Link href="/weekly" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">View report <Glyph name="arrow" className="h-4 w-4" /></Link></div><p className="mt-1 text-sm text-slate-500">Your progress this reporting week</p><div className="mt-5 flex items-center gap-3"><div className="h-5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div><span className="text-lg font-bold text-slate-800">{percent}%</span></div><div className="mt-7 grid grid-cols-3 divide-x divide-slate-100"><Stat icon="check" tone="emerald" value={stats.completed ?? 0} label="Complete" /><Stat icon="clock" tone="blue" value={stats.active ?? 0} label="Active" /><Stat icon="alert" tone="red" value={stats.blocked ?? 0} label="Blocked" /></div></div></Panel>
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
      <div className="space-y-4"><Panel><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-xl font-bold tracking-tight text-slate-950">Today <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-sm text-slate-600">{work.length}</span></h2><p className="mt-1 text-sm text-slate-500">Your key priorities for today</p></div><Link href="/work" className={`${btnSecondary} gap-2 px-3 py-2`}><Glyph name="plus" className="h-4 w-4 text-blue-600" />Add task</Link></div>{work.length === 0 ? <p className="p-5 text-sm text-slate-500">No work needs attention today. Add a task to get started.</p> : <ul className="divide-y divide-slate-100">{work.map((item) => <li key={item.id} className="flex items-center gap-4 px-5 py-3.5"><span className="h-6 w-6 rounded-md border-2 border-slate-300" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{item.title}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.description || item.objective_title || "Continue with this planned work."}</p></div>{item.focus_area && <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{item.focus_area}</span>}<span className="flex items-center gap-1 text-xs text-slate-500"><Glyph name="clock" className="h-4 w-4" />{item.due_date ?? "Today"}</span><Glyph name="arrow" className="h-4 w-4 text-slate-400" /></li>)}</ul>}</Panel>
        <Panel><div className="flex items-center justify-between px-5 pt-5"><h2 className="text-xl font-bold tracking-tight text-slate-950">Recent Activity</h2><Link href="/work" className="text-sm font-medium text-blue-600">View all</Link></div>{recentUpdates.length === 0 ? <p className="p-5 text-sm text-slate-500">Updates you record will appear here.</p> : <ul className="px-5 pb-3 pt-3">{recentUpdates.map((update, index) => <li key={update.id} className="flex gap-3 pb-4 last:pb-1"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${index === 0 ? "bg-blue-600" : index === 1 ? "bg-blue-300" : "bg-emerald-500"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{update.work_title ?? "You recorded reactive work"}</p><p className="truncate text-xs text-slate-500">{update.text}</p></div><span className="whitespace-nowrap text-xs text-slate-400">{update.update_date === today ? "Today" : update.update_date}</span></li>)}</ul>}</Panel></div>
      <div className="space-y-4"><Panel><div className="flex items-center justify-between px-5 pt-5"><div><h2 className="text-xl font-bold tracking-tight text-slate-950">Your Objectives</h2><p className="mt-1 text-sm text-slate-500">{objectiveCards.length} current objective{objectiveCards.length === 1 ? "" : "s"}</p></div><Link href="/monthly" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">View all <Glyph name="arrow" className="h-4 w-4" /></Link></div>{objectiveCards.length === 0 ? <p className="p-5 text-sm text-slate-500">Set your plan for {MONTH_NAMES[month - 1]} to see objectives here.</p> : <ul className="mt-3 divide-y divide-slate-100">{objectiveCards.map((objective, index) => <li key={objective.id} className="flex gap-3 px-5 py-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index === 0 ? "bg-blue-50 text-blue-600" : index === 1 ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"}`}><Glyph name={index === 1 ? "people" : index === 2 ? "file" : "check"} className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{objective.title}</p><span className="text-sm font-bold text-slate-700">{objective.percent}%</span></div><p className="mt-0.5 truncate text-xs text-slate-500">{objective.description || "Set a meaningful outcome for this objective."}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${objective.percent}%` }} /></div></div></li>)}</ul>}</Panel>
        <Panel><div className="flex items-start gap-3 p-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Glyph name="file" className="h-6 w-6" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold tracking-tight text-slate-950">Weekly Report</h2><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{draft.length ? "Partly prepared" : "Waiting for updates"}</span></div><p className="mt-1 text-sm text-slate-500">Your weekly report is prepared from your updates, tasks and activity.</p><div className="mt-4 grid grid-cols-2 gap-2"><Link href="/weekly" className={`${btnPrimary} w-full`}>Review draft</Link><Link href="/weekly" className={`${btnSecondary} w-full`}>View reports</Link></div></div></div></Panel></div>
    </div>
  </div>;
}

function Stat({ icon, tone, value, label }: { icon: "check" | "clock" | "alert"; tone: "emerald" | "blue" | "red"; value: number; label: string }) {
  const toneClasses = { emerald: "bg-emerald-100 text-emerald-600", blue: "bg-blue-100 text-blue-600", red: "bg-red-100 text-red-500" };
  return <div className="pl-4 first:pl-0"><p className="flex items-center gap-2 text-2xl font-bold text-slate-950"><span className={`rounded-full p-1 ${toneClasses[tone]}`}><Glyph name={icon} className="h-4 w-4" /></span>{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>;
}
