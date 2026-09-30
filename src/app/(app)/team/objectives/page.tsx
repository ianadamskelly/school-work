import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { createObjective, toggleObjective } from "@/lib/actions";

type Status = "on_track" | "at_risk" | "not_started" | "blocked";
type Objective = { id: number; title: string; description: string; active: number; linked_objectives: number; linked_activities: number; total_work: number; completed_work: number; blocked_work: number };

const statusMeta: Record<Status, { label: string; dot: string; chip: string }> = {
  on_track: { label: "On track", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  at_risk: { label: "At risk", dot: "bg-amber-400", chip: "bg-amber-50 text-amber-700" },
  not_started: { label: "Not started", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600" },
  blocked: { label: "Blocked", dot: "bg-red-500", chip: "bg-red-50 text-red-700" },
};

function Icon({ name }: { name: "laptop" | "cap" | "chart" | "shield" | "file" | "comment" | "clock" | "target" }) {
  const shapes = {
    laptop: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M2 19h20" /></>,
    cap: <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 11v4c3 2 7 2 10 0v-4M21 9v5" /></>,
    chart: <><path d="M5 20V10M12 20V4M19 20v-7" /></>,
    shield: <path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3Z" />,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    comment: <path d="M5 5h14v10H9l-4 4V5Z" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m15 9 5-5" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

function getStatus(item: Objective): Status {
  if (!item.active || !item.total_work) return "not_started";
  if (item.blocked_work) return "blocked";
  return item.completed_work / item.total_work < 0.4 ? "at_risk" : "on_track";
}

function Metric({ glyph, value, label }: { glyph: "file" | "comment" | "clock"; value: number | string; label: string }) {
  return <div className="flex items-center gap-3"><span className="h-6 w-6 text-blue-600"><Icon name={glyph} /></span><span><strong className="block text-lg leading-5 text-slate-900">{value}</strong><span className="block text-xs text-slate-500">{label}</span></span></div>;
}

export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireSessionUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");
  const { status: selectedStatus = "all" } = await searchParams;
  const objectives = getDb().prepare(`
    SELECT o.id, o.title, o.description, o.active,
      (SELECT COUNT(DISTINCT mo.id) FROM monthly_objectives mo JOIN monthly_objective_strategic_links link ON link.monthly_objective_id = mo.id WHERE link.strategic_objective_id = o.id) AS linked_objectives,
      (SELECT COUNT(DISTINCT wi.id) FROM work_items wi LEFT JOIN monthly_objective_strategic_links link ON link.monthly_objective_id = wi.monthly_objective_id WHERE wi.objective_id = o.id OR link.strategic_objective_id = o.id) AS total_work,
      (SELECT COUNT(DISTINCT wi.id) FROM work_items wi LEFT JOIN monthly_objective_strategic_links link ON link.monthly_objective_id = wi.monthly_objective_id WHERE (wi.objective_id = o.id OR link.strategic_objective_id = o.id) AND wi.status = 'completed') AS completed_work,
      (SELECT COUNT(DISTINCT wi.id) FROM work_items wi LEFT JOIN monthly_objective_strategic_links link ON link.monthly_objective_id = wi.monthly_objective_id WHERE (wi.objective_id = o.id OR link.strategic_objective_id = o.id) AND wi.status = 'blocked') AS blocked_work,
      (SELECT COUNT(DISTINCT wu.id) FROM work_updates wu JOIN work_items wi ON wi.id = wu.work_item_id LEFT JOIN monthly_objective_strategic_links link ON link.monthly_objective_id = wi.monthly_objective_id WHERE wi.objective_id = o.id OR link.strategic_objective_id = o.id) AS linked_activities
    FROM objectives o WHERE o.manager_id = ? ORDER BY o.active DESC, o.title
  `).all(user.id) as Objective[];
  const all = objectives.map((objective) => ({ ...objective, status: getStatus(objective) }));
  const shown = selectedStatus === "all" ? all : all.filter((item) => item.status === selectedStatus);
  const counts = { on_track: 0, at_risk: 0, not_started: 0, blocked: 0 };
  all.forEach((item) => counts[item.status]++);
  const totalActivities = all.reduce((sum, item) => sum + item.linked_activities, 0);
  const totalLinked = all.reduce((sum, item) => sum + item.linked_objectives, 0);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date());
  const iconNames = ["laptop", "cap", "chart", "shield"] as const;
  const iconTones = ["bg-blue-50 text-blue-600", "bg-emerald-50 text-emerald-600", "bg-violet-50 text-violet-600", "bg-red-50 text-red-500"];

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
      <div><h1 className="text-[34px] font-bold leading-none tracking-[-0.045em] text-slate-950 sm:text-[42px]">Strategic Objectives</h1><p className="mt-2 text-base text-slate-500">Align work to our school&apos;s priorities and track progress towards our goals.</p>
        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-800"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-blue-600">‹</span><span className="min-w-44 rounded-lg border border-slate-200 bg-white px-4 py-2 text-center">{month}⌄</span><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-blue-600">›</span></div>
      </div>
      <details className="group relative shrink-0"><summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">＋ Add strategic objective</summary>
        <form action={createObjective} className="absolute right-0 top-14 z-20 w-[min(390px,calc(100vw-3rem))] rounded-xl border border-slate-200 bg-white p-5 shadow-xl"><p className="mb-4 text-base font-semibold text-slate-900">New strategic objective</p><label className="mb-3 block text-xs font-semibold text-slate-600">Objective<input name="title" required placeholder="e.g. Improve IT infrastructure" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label><label className="block text-xs font-semibold text-slate-600">Success statement<textarea name="description" placeholder="What should success look like?" className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label><button className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Add objective</button></form>
      </details>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section><nav className="mb-5 flex overflow-x-auto border-b border-slate-200" aria-label="Objective status filters">
        {(["all", "on_track", "at_risk", "not_started", "blocked"] as const).map((filter) => { const meta = filter === "all" ? null : statusMeta[filter]; const active = selectedStatus === filter; const count = filter === "all" ? all.length : counts[filter]; return <Link key={filter} href={filter === "all" ? "/team/objectives" : `/team/objectives?status=${filter}`} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${active ? "border-blue-600 bg-blue-50/70 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{meta && <i className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />}{filter === "all" ? "All" : meta?.label}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{count}</span></Link>; })}
      </nav>
      <div className="space-y-4">{shown.map((item, index) => { const progress = item.total_work ? Math.round((item.completed_work / item.total_work) * 100) : 0; const meta = statusMeta[item.status]; return <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]"><div className="flex gap-4"><span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${iconTones[index % 4]}`}><span className="h-7 w-7"><Icon name={iconNames[index % 4]} /></span></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold tracking-[-0.025em] text-slate-950">{item.title}</h2><span className="mt-1 inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">Strategic objective</span></div><div className="flex items-center gap-3"><span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${meta.chip}`}><i className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />{meta.label}</span><span className="text-sm font-medium text-blue-600">View objective →</span></div></div><div className="mt-3 flex items-center gap-3"><div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div><strong className="text-sm text-slate-800">{progress}%</strong></div><p className="mt-3 text-sm text-slate-500">{item.description || "Keep this strategic priority connected to clear monthly objectives and meaningful activity."}</p></div></div><div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4"><Metric glyph="file" value={item.linked_objectives} label="Linked objectives" /><Metric glyph="comment" value={item.linked_activities} label="Linked activities" /><Metric glyph="clock" value={item.total_work ? `${item.completed_work}/${item.total_work}` : "—"} label="Work completed" /><div className="flex items-center gap-3 border-slate-100 sm:border-l sm:pl-4"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{user.name.charAt(0)}</span><span><span className="block text-xs text-slate-400">Owner</span><span className="block text-sm font-medium text-slate-800">{user.name}</span></span></div></div><div className="mt-3 flex justify-end"><form action={toggleObjective}><input type="hidden" name="id" value={item.id} /><button className="text-xs font-medium text-slate-400 hover:text-slate-700">{item.active ? "Retire objective" : "Reactivate objective"}</button></form></div></article>; })}{!shown.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">No objectives match this filter yet.</div>}</div>
      </section>
      <aside className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold tracking-[-0.025em] text-slate-950">Objectives Overview</h2><span className="text-sm font-medium text-blue-600">View report →</span></div><p className="mt-4 text-4xl font-bold tracking-[-0.04em] text-slate-950">{all.length}</p><p className="text-sm text-slate-500">Strategic objectives</p><p className="mt-1 text-sm text-slate-400">{month}</p><div className="mt-5 flex h-5 overflow-hidden rounded-full bg-slate-100">{(["on_track", "at_risk", "not_started", "blocked"] as Status[]).map((status) => <span key={status} className={statusMeta[status].dot} style={{ width: `${all.length ? (counts[status] / all.length) * 100 : 0}%` }} />)}</div><div className="mt-5 space-y-3">{(["on_track", "at_risk", "not_started", "blocked"] as Status[]).map((status) => <div key={status} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-slate-500"><i className={`h-3 w-3 rounded-full ${statusMeta[status].dot}`} />{statusMeta[status].label}</span><span className="font-semibold text-slate-800">{counts[status]} <span className="ml-5 font-normal text-slate-500">{all.length ? Math.round((counts[status] / all.length) * 100) : 0}%</span></span></div>)}</div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><span className="h-6 w-6"><Icon name="target" /></span></span><h2 className="text-lg font-bold tracking-[-0.025em] text-slate-950">Linked Activity</h2></div><p className="mt-4 text-4xl font-bold tracking-[-0.04em] text-slate-950">{totalActivities}</p><p className="text-sm text-slate-500">Total linked activities</p><p className="mt-1 text-sm text-slate-400">Across all strategic objectives</p><div className="mt-5 grid grid-cols-2 border-t border-slate-100 pt-4"><Metric glyph="file" value={totalLinked} label="Linked objectives" /><Metric glyph="comment" value={totalActivities} label="Updates this month" /></div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex gap-3"><span className="text-3xl text-amber-500">☼</span><div><p className="text-base font-medium italic text-slate-700">“Great schools are built on clear priorities.”</p><p className="mt-3 text-sm leading-5 text-slate-500">Keep your strategic objectives focused and aligned with your school&apos;s vision.</p></div></div></section>
      </aside>
    </div>
  </div>;
}
