import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { approveMonthlyPlan } from "@/lib/actions";
import { MONTH_NAMES } from "@/lib/rotation";

type Member = { id: number; name: string; job_title: string; plan_id: number | null; plan_status: string | null; submitted_at: string | null; manager_feedback: string; objective_count: number; focus_count: number; blockers: number; completed: number; total_work: number };
type Tab = "pending" | "approved" | "changes";

function Icon({ name }: { name: "team" | "report" | "alert" | "target" | "check" | "clock" | "search" | "sun" | "eye" }) {
  const shapes = {
    team: <><circle cx="9" cy="9" r="3" /><circle cx="16" cy="10" r="2.5" /><path d="M3.5 20c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5M14 15c3 0 5 1.7 5.5 5" /></>,
    report: <><path d="M7 3h7l3 3v15H7z" /><path d="M14 3v4h4M10 12h4M10 16h4" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5M12 16h.01" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m12 12 7-7" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12" /><circle cx="12" cy="12" r="2.5" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white shadow-[0_2px_5px_rgba(15,23,42,0.025)] ${className}`}>{children}</section>;
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string; q?: string }> }) {
  const user = await requireSessionUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");
  const params = await searchParams;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const scope = user.role === "admin" ? "u.template_id IS NOT NULL AND u.active = 1" : "u.manager_id = ? AND u.active = 1";
  const args = user.role === "admin" ? [] : [user.id];
  const members = getDb().prepare(`
    SELECT u.id, u.name, u.job_title, mp.id AS plan_id, mp.status AS plan_status, mp.submitted_at, COALESCE(mp.manager_feedback, '') AS manager_feedback,
      (SELECT COUNT(*) FROM monthly_objectives mo WHERE mo.plan_id = mp.id) AS objective_count,
      (SELECT COUNT(*) FROM monthly_focus_areas mfa JOIN monthly_objectives mo ON mo.id = mfa.monthly_objective_id WHERE mo.plan_id = mp.id) AS focus_count,
      (SELECT COUNT(*) FROM blockers b JOIN work_items wi ON wi.id = b.work_item_id WHERE wi.user_id = u.id AND b.resolved = 0) AS blockers,
      (SELECT COUNT(*) FROM work_items wi WHERE wi.user_id = u.id AND wi.status = 'completed') AS completed,
      (SELECT COUNT(*) FROM work_items wi WHERE wi.user_id = u.id AND wi.status != 'cancelled') AS total_work
    FROM users u LEFT JOIN monthly_plans mp ON mp.user_id = u.id AND mp.year = ? AND mp.month = ?
    WHERE ${scope} ORDER BY u.name
  `).all(year, month, ...args) as Member[];
  return params.tab === "objectives"
    ? <ObjectivesApproval members={members} year={year} month={month} view={params.view as Tab | undefined} query={params.q ?? ""} />
    : <Overview members={members} />;
}

function Overview({ members }: { members: Member[] }) {
  const pending = members.filter((m) => m.plan_status === "proposed" && m.submitted_at).length;
  const blockers = members.reduce((sum, m) => sum + m.blockers, 0);
  const progress = members.length ? Math.round(members.reduce((sum, m) => sum + (m.total_work ? (m.completed / m.total_work) * 100 : 0), 0) / members.length) : 0;
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-[40px] font-bold leading-none tracking-[-.045em] text-slate-950">Team Overview</h1><p className="mt-2 text-[17px] text-slate-500">Monitor progress, review reports, and unblock work.</p></div><Quote>“Great teams turn progress<br />into possibility.”</Quote></div>
    <Panel className="p-4"><h2 className="text-xl font-bold text-slate-950">Needs your attention</h2><div className="mt-3 grid gap-3 md:grid-cols-3"><Attention icon="report" tone="blue" value={0} label="Reports awaiting review" /><Attention icon="alert" tone="red" value={blockers} label="Objectives blocked" /><Link href="/team?tab=objectives" className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 hover:border-blue-200"><span className="rounded-xl bg-violet-50 p-3 text-violet-600"><span className="block h-6 w-6"><Icon name="team" /></span></span><div><p className="text-2xl font-bold text-slate-950">{pending}</p><p className="text-sm text-slate-500">Plans pending approval</p></div><span className="ml-auto text-slate-400">›</span></Link></div></Panel>
    <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]"><Panel className="p-5"><h2 className="text-xl font-bold text-slate-950">Team members</h2><p className="mt-1 text-sm text-slate-500">{members.length} team member{members.length === 1 ? "" : "s"} · {progress}% average work completion</p><div className="mt-4 divide-y divide-slate-100">{members.map((m) => { const pct = m.total_work ? Math.round(m.completed / m.total_work * 100) : 0; return <Link href={`/team/${m.id}`} key={m.id} className="flex items-center gap-3 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-600">{m.name.charAt(0)}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{m.name}</strong><span className="text-xs text-slate-500">{m.job_title || "Team member"}</span></span><div className="hidden w-44 sm:block"><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${pct}%` }} /></div></div><span className="text-sm font-semibold text-slate-700">{pct}%</span></Link>; })}</div></Panel>
    <Panel className="p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><span className="block h-6 w-6"><Icon name="target" /></span></span><div><h2 className="text-xl font-bold text-slate-950">Team objectives</h2><p className="text-sm text-slate-500">Current monthly plans</p></div></div><p className="mt-6 text-5xl font-bold tracking-[-.05em] text-slate-950">{members.reduce((sum, m) => sum + m.objective_count, 0)}</p><p className="text-sm text-slate-500">objectives set this month</p><Link href="/team?tab=objectives" className="mt-6 inline-block text-sm font-semibold text-blue-600">Review objective submissions →</Link></Panel></div>
  </div>;
}

function ObjectivesApproval({ members, year, month, view = "pending", query }: { members: Member[]; year: number; month: number; view?: Tab; query: string }) {
  const pending = members.filter((m) => m.plan_status === "proposed" && !!m.submitted_at);
  const approved = members.filter((m) => m.plan_status === "approved");
  const changes = members.filter((m) => m.plan_status === "proposed" && !m.submitted_at && !!m.manager_feedback);
  const active = view === "approved" ? approved : view === "changes" ? changes : pending;
  const filtered = query ? active.filter((m) => `${m.name} ${m.job_title}`.toLowerCase().includes(query.toLowerCase())) : active;
  const submitted = members.filter((m) => m.plan_status === "approved" || !!m.submitted_at).length;
  const percentage = members.length ? Math.round((submitted / members.length) * 100) : 0;
  const tab = (id: Tab, label: string, value: number) => <Link href={`/team?tab=objectives&view=${id}`} className={`border-b-2 px-3 py-3 text-sm ${view === id ? "border-blue-600 font-semibold text-blue-600" : "border-transparent font-medium text-slate-500 hover:text-slate-800"}`}>{label} <span className={`ml-1 rounded-full px-2 py-1 text-xs ${view === id ? "bg-blue-50" : "bg-slate-100"}`}>{value}</span></Link>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[40px] font-bold leading-none tracking-[-.045em] text-slate-950">Team Objectives — {MONTH_NAMES[month - 1]} {year}</h1><p className="mt-2 text-[17px] text-slate-500">Review and approve your team&apos;s monthly objective proposals.</p></div><Quote>“Clear goals create stronger teams.”</Quote></div>
    <div className="flex gap-2 overflow-x-auto border-b border-slate-200">{tab("pending", "Pending Approval", pending.length)}{tab("approved", "Approved", approved.length)}{tab("changes", "Needs Changes", changes.length)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_326px]"><section><Panel className="overflow-hidden"><form className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 md:grid-cols-[1.3fr_.7fr_.7fr]"><div className="relative"><span className="absolute left-3 top-3 h-4 w-4 text-slate-400"><Icon name="search" /></span><input name="q" defaultValue={query} placeholder="Search team members by name or role..." className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div><select className="rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600"><option>All departments</option></select><select className="rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600"><option>All statuses</option></select><input type="hidden" name="tab" value="objectives" /><input type="hidden" name="view" value={view} /></form>
      <div className="overflow-x-auto"><table className="w-full min-w-[770px] text-left"><thead className="border-b border-slate-100 text-xs text-slate-500"><tr><th className="w-10 px-3 py-4"><input type="checkbox" aria-label="Select all" /></th><th>Team member</th><th>Objectives</th><th>Focus areas</th><th>Submitted</th><th className="pr-3">Actions</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">No submissions in this view yet.</td></tr> : filtered.map((m) => <ApprovalRow key={m.id} member={m} tab={view} />)}</tbody></table></div>
      <div className="flex justify-between px-4 py-5 text-sm text-slate-500"><span>Showing {filtered.length} of {active.length} submissions</span><span className="flex gap-2"><i className="rounded-lg border border-slate-200 px-3 py-1 not-italic">‹</i><i className="rounded-lg bg-blue-600 px-3 py-1 font-medium text-white not-italic">1</i><i className="rounded-lg border border-slate-200 px-3 py-1 not-italic">›</i></span></div>
    </Panel></section>
    <aside className="space-y-4"><Panel className="p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-950">Submission Summary</h2><span className="text-xs text-slate-400">1–{new Date(year, month, 0).getDate()} {MONTH_NAMES[month - 1]}</span></div><div className="mt-5 flex items-center gap-5"><div className="flex h-32 w-32 items-center justify-center rounded-full border-[16px] border-emerald-500 border-r-amber-400 border-t-red-400"><div className="text-center"><strong className="block text-2xl text-slate-900">{members.length}</strong><span className="text-xs text-slate-500">Total<br />submissions</span></div></div><div className="space-y-3 text-sm"><Legend tone="bg-amber-400" value={pending.length} label="Pending approval" /><Legend tone="bg-emerald-500" value={approved.length} label="Approved" /><Legend tone="bg-red-500" value={changes.length} label="Need changes" /></div></div></Panel>
    <Panel className="p-5"><div className="flex justify-between"><div><h2 className="text-xl font-bold text-slate-950">Your Team</h2><p className="mt-3 font-semibold text-slate-800">{members.length} team members</p><p className="text-sm text-slate-500">{submitted}/{members.length} have submitted their objectives</p></div><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><span className="block h-6 w-6"><Icon name="team" /></span></span></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${percentage}%` }} /></div><p className="mt-2 text-right text-sm font-semibold text-slate-700">{percentage}%</p></Panel>
    <Panel className="bg-blue-50 p-5"><div className="flex gap-3"><span className="h-7 w-7 shrink-0 text-blue-600"><Icon name="target" /></span><div><h2 className="font-semibold text-blue-700">Review and approve</h2><p className="mt-2 text-sm leading-5 text-slate-600">Check that objectives are clear, measurable and aligned with team and school priorities.</p><p className="mt-3 text-sm font-medium text-blue-600">View objective guidelines →</p></div></div></Panel>
    <Panel className="p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><span className="block h-6 w-6"><Icon name="clock" /></span></span><div><h2 className="font-semibold text-slate-900">Approval deadline</h2><p className="mt-2 text-sm text-slate-500">Review submissions before the month ends to keep the team on track.</p></div></div></Panel></aside></div>
  </div>;
}

function ApprovalRow({ member, tab }: { member: Member; tab: Tab }) {
  const submitted = member.submitted_at ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(member.submitted_at)) : "Awaiting revision";
  return <tr className="border-b border-slate-100 last:border-0"><td className="px-3 py-4"><input type="checkbox" aria-label={`Select ${member.name}`} /></td><td className="py-4"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{member.name.charAt(0)}</span><span><strong className="block text-sm text-slate-800">{member.name}</strong><span className="text-sm text-slate-500">{member.job_title || "Team member"}</span></span></div></td><td className="py-4 font-semibold text-slate-700">{member.objective_count}</td><td className="py-4 font-semibold text-slate-700">{member.focus_count}</td><td className="py-4 text-sm"><strong className="block text-slate-700">{submitted}</strong><span className="text-slate-400">{tab === "approved" ? "Approved" : tab === "changes" ? "Awaiting update" : "Awaiting review"}</span></td><td className="py-4 pr-3"><div className="flex gap-2"><Link href={`/team/${member.id}`} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50"><span className="h-4 w-4"><Icon name="eye" /></span>View</Link>{tab === "pending" && <><form action={approveMonthlyPlan}><input type="hidden" name="plan_id" value={member.plan_id ?? ""} /><button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">Approve</button></form><Link href={`/team/${member.id}`} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50">Request changes</Link></>}{tab === "approved" && <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">✓ Approved</span>}{tab === "changes" && <Link href={`/team/${member.id}`} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700">Review revision</Link>}</div></td></tr>;
}

function Attention({ icon, tone, value, label }: { icon: "report" | "alert"; tone: "blue" | "red"; value: number; label: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"><span className={`rounded-xl p-3 ${tone === "red" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"}`}><span className="block h-6 w-6"><Icon name={icon} /></span></span><div><p className="text-2xl font-bold text-slate-950">{value}</p><p className="text-sm text-slate-500">{label}</p></div><span className="ml-auto text-slate-400">›</span></div>;
}

function Legend({ tone, value, label }: { tone: string; value: number; label: string }) {
  return <p className="flex items-center gap-2 whitespace-nowrap"><i className={`h-3 w-3 rounded-full ${tone}`} /><strong className="text-slate-800">{value}</strong><span className="text-slate-500">{label}</span></p>;
}

function Quote({ children }: { children: React.ReactNode }) {
  return <div className="hidden items-center gap-3 rounded-xl bg-slate-100 px-5 py-3 text-sm italic text-slate-500 lg:flex"><span className="h-7 w-7 text-amber-500"><Icon name="sun" /></span>{children}</div>;
}
