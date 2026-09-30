import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";

type Update = { id: number; log_date: string; activity: string; outcome: string; hours: number; status: string; priority: string; category: string | null; department: string | null };
type Category = { id: number; name: string };

function Icon({ name, className = "" }: { name: "calendar" | "search" | "link" | "clip" | "plus" | "file" | "clock" | "chevron"; className?: string }) {
  const shapes = {
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></>,
    link: <><path d="m10 13 4-4M8 17l-1.5 1.5a3 3 0 0 1-4-4L5 12M16 7l1.5-1.5a3 3 0 0 1 4 4L19 12" /></>,
    clip: <path d="m9 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{shapes[name]}</svg>;
}

function isoMonth(value?: string) {
  return /^\d{4}-\d{2}$/.test(value ?? "") ? value! : new Date().toISOString().slice(0, 7);
}

export default async function DailyUpdatesPage({ searchParams }: { searchParams: Promise<{ month?: string; q?: string; category?: string }> }) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const month = isoMonth(params.month);
  const [year, numericMonth] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(year, numericMonth, 0).toISOString().slice(0, 10);
  const categories = user.template_id ? getDb().prepare("SELECT id, name FROM task_categories WHERE template_id = ? ORDER BY sort").all(user.template_id) as Category[] : [];
  let updates = getDb().prepare(`SELECT dl.id, dl.log_date, dl.activity, dl.outcome, dl.hours, dl.status, dl.priority, tc.name AS category, d.name AS department FROM daily_logs dl LEFT JOIN task_categories tc ON tc.id = dl.category_id LEFT JOIN departments d ON d.id = dl.department_id WHERE dl.user_id = ? AND dl.log_date BETWEEN ? AND ? ORDER BY dl.log_date DESC, dl.id DESC`).all(user.id, monthStart, monthEnd) as Update[];
  if (params.q) { const q = params.q.toLowerCase(); updates = updates.filter((item) => `${item.activity} ${item.outcome} ${item.category ?? ""}`.toLowerCase().includes(q)); }
  if (params.category) updates = updates.filter((item) => String(categories.find((category) => category.name === item.category)?.id ?? "") === params.category);
  const byDay = new Map<string, Update[]>();
  updates.forEach((item) => byDay.set(item.log_date, [...(byDay.get(item.log_date) ?? []), item]));
  const days = [...byDay.entries()];
  const activeDays = byDay.size;
  const average = activeDays ? (updates.length / activeDays).toFixed(1) : "0";
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(`${monthStart}T12:00:00`));
  const previous = new Date(year, numericMonth - 2, 1).toISOString().slice(0, 7);
  const next = new Date(year, numericMonth, 1).toISOString().slice(0, 7);
  const accent = ["bg-blue-600", "bg-violet-500", "bg-emerald-500", "bg-slate-400"];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[38px] font-bold leading-none tracking-[-.045em] text-slate-950">Daily Updates — {monthLabel}</h1><p className="mt-2 text-[17px] text-slate-500">A chronological log of your work, progress and activity.</p></div><div className="flex items-center gap-3"><Link href={`/daily/updates?month=${previous}`} className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 text-blue-600">‹</Link><span className="flex h-12 min-w-52 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800"><span className="h-5 w-5"><Icon name="calendar" /></span>{monthLabel}⌄</span><Link href={`/daily/updates?month=${next}`} className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 text-blue-600">›</Link><Link href="/daily" className="ml-2 inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><span className="h-5 w-5"><Icon name="plus" /></span>Add update</Link></div></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"><main><form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[.9fr_1fr_1.7fr]"><label className="relative"><span className="absolute left-3 top-3 h-5 w-5 text-slate-500"><Icon name="link" /></span><select className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-600"><option>All work types</option><option>Planned work</option><option>Recurring work</option><option>Reactive work</option></select></label><select name="category" defaultValue={params.category ?? ""} className="rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600"><option value="">All objectives</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label className="relative"><span className="absolute left-3 top-3 h-5 w-5 text-slate-400"><Icon name="search" /></span><input name="q" defaultValue={params.q} placeholder="Search your updates..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500" /><input type="hidden" name="month" value={month} /></label></form>
      <div className="mt-4 space-y-4">{days.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-lg font-semibold text-slate-800">No updates this month</p><p className="mt-2 text-sm text-slate-500">Start a daily update to build your work timeline.</p><Link href="/daily" className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Add update</Link></div> : days.map(([date, entries]) => <section key={date} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3"><h2 className="font-bold text-slate-900">{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`))}</h2><span className="text-sm text-slate-500">{entries.length} update{entries.length === 1 ? "" : "s"}⌃</span></header><div className="divide-y divide-slate-100">{entries.map((item, index) => <div key={item.id} className="grid gap-3 px-4 py-3 md:grid-cols-[90px_16px_minmax(0,1fr)_auto] md:items-start"><span className="pt-0.5 text-sm text-slate-500">{item.status === "Completed" ? "Completed" : item.status}</span><span className="mt-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-4 ring-white"><i className={`h-3 w-3 rounded-full ${accent[index % accent.length]}`} /></span><div className="min-w-0"><strong className="block text-sm text-slate-900">{item.activity}</strong>{item.outcome && <p className="mt-1 text-sm leading-5 text-slate-500">{item.outcome}</p>}</div><div className="flex flex-wrap items-center gap-2 md:justify-end">{item.department && <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{item.department}</span>}{item.category && <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600"><span className="h-3.5 w-3.5 text-blue-600"><Icon name="file" /></span>{item.category}</span>}<span className="inline-flex items-center gap-1 text-xs text-slate-500"><span className="h-4 w-4"><Icon name="clock" /></span>{item.hours}h</span><span className="text-slate-400">•••</span></div></div>)}</div></section>)}</div></main>
    <aside className="space-y-4"><Calendar year={year} month={numericMonth} activeDays={new Set([...byDay.keys()].map((date) => Number(date.slice(-2))))} /><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold tracking-tight text-slate-950">This Month</h2><div className="mt-5 grid grid-cols-3 divide-x divide-slate-100 text-center"><Stat value={updates.length} label="Updates logged" icon="file" /><Stat value={activeDays} label="Days with activity" icon="calendar" /><Stat value={average} label="Avg. updates per day" icon="clock" /></div></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold tracking-tight text-slate-950">Work type breakdown</h2><div className="mt-5 space-y-3">{Object.entries(groupCategories(updates)).map(([name, value], index) => <div key={name}><div className="flex justify-between text-xs"><span className="flex items-center gap-2 text-slate-600"><i className={`h-3 w-3 rounded-full ${accent[index]}`} />{name}</span><strong className="text-slate-700">{updates.length ? Math.round((value / updates.length) * 100) : 0}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${accent[index]}`} style={{ width: `${updates.length ? (value / updates.length) * 100 : 0}%` }} /></div></div>)}</div></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold tracking-tight text-slate-950">Quick Actions</h2><div className="mt-4 space-y-2"><Link href="/daily" className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"><span className="h-5 w-5 text-blue-600"><Icon name="plus" /></span>Add update</Link><Link href="/weekly" className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"><span className="h-5 w-5 text-blue-600"><Icon name="calendar" /></span>View weekly report</Link></div></section></aside></div>
  </div>;
}

function groupCategories(updates: Update[]) {
  const counts = new Map<string, number>();
  updates.forEach((update) => counts.set(update.department || update.category || "Other", (counts.get(update.department || update.category || "Other") ?? 0) + 1));
  return Object.fromEntries([...counts.entries()].slice(0, 4).length ? [...counts.entries()].slice(0, 4) : [["Other", 0]]);
}

function Stat({ value, label, icon }: { value: number | string; label: string; icon: "file" | "calendar" | "clock" }) {
  return <div className="px-2"><span className="mx-auto block h-6 w-6 text-blue-600"><Icon name={icon} /></span><strong className="mt-2 block text-2xl text-slate-900">{value}</strong><span className="mt-1 block text-xs leading-4 text-slate-500">{label}</span></div>;
}

function Calendar({ year, month, activeDays }: { year: number; month: number; activeDays: Set<number> }) {
  const first = new Date(year, month - 1, 1).getDay();
  const leading = (first + 6) % 7;
  const total = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: leading + total }, (_, index) => index < leading ? null : index - leading + 1);
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))}</h2><span className="text-blue-600">‹　›</span></div><div className="mt-5 grid grid-cols-7 gap-y-3 text-center text-xs">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <strong key={day} className="font-medium text-slate-400">{day}</strong>)}{cells.map((day, index) => <span key={index} className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full ${day && activeDays.has(day) ? "bg-blue-600 font-semibold text-white" : "text-slate-600"}`}>{day}{day && activeDays.has(day) && <i className="absolute -bottom-1 h-1 w-1 rounded-full bg-emerald-400" />}</span>)}</div></section>;
}
