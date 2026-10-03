import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { approveWeeklySummary, requestWeeklySummaryChanges } from "@/lib/actions";
import { weekOfMonth } from "@/lib/rotation";

type Report = { id: number; user_id: number; name: string; job_title: string; manager_id: number | null; year: number; month: number; week_of_month: number; tasks_completed: string; evidence: string; challenges: string; solutions: string; impact: string; next_week_plan: string; risk_level: string; status: string; manager_comment: string; created_at: string };
type Objective = { title: string; description: string; progress_percent: number };
type Daily = { log_date: string; activity: string; status: string };
type Evidence = { id: number; original_name: string };

function Icon({ name, className = "" }: { name: "file" | "calendar" | "comment" | "target" | "trophy" | "alert" | "focus" | "clip" | "chevron"; className?: string }) {
  const shapes = {
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    comment: <path d="M5 5h14v10H9l-4 4V5Z" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m12 12 7-7" /></>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v5M8 21h8" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5M12 16h.01" /></>,
    focus: <><circle cx="12" cy="12" r="8" /><path d="m12 12 7-7" /></>,
    clip: <path d="m9 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" />,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{shapes[name]}</svg>;
}

const monthName = (month: number) => new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(2025, month - 1, 1));
const lines = (value: string) => value.split(/\n|•/).map((item) => item.trim()).filter(Boolean);

export default async function WeeklyReportReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reviewed?: string; feedback?: string }> }) {
  const user = await requireSessionUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();
  const report = db.prepare(`SELECT ws.*, u.name, u.job_title, u.manager_id FROM weekly_summaries ws JOIN users u ON u.id = ws.user_id WHERE ws.id = ?`).get(Number(id)) as Report | undefined;
  if (!report) notFound();
  if (user.role === "manager" && report.manager_id !== user.id) redirect("/team");
  const objectives = db.prepare(`SELECT o.title, o.description, wop.progress_percent FROM weekly_objective_progress wop JOIN objectives o ON o.id = wop.objective_id WHERE wop.summary_id = ? ORDER BY o.title`).all(report.id) as Objective[];
  const daily = db.prepare("SELECT log_date, activity, status FROM daily_logs WHERE user_id = ? AND log_date LIKE ? ORDER BY log_date DESC, id DESC").all(report.user_id, `${report.year}-${String(report.month).padStart(2, "0")}%`) as Daily[];
  const reportDays = daily.filter((item) => weekOfMonth(new Date(`${item.log_date}T12:00:00`)) === report.week_of_month);
  const evidenceStart = `${report.year}-${String(report.month).padStart(2, "0")}-${String((report.week_of_month - 1) * 7 + 1).padStart(2, "0")}`;
  const evidenceEnd = report.week_of_month === 4 ? `${report.year}-${String(report.month).padStart(2, "0")}-31` : `${report.year}-${String(report.month).padStart(2, "0")}-${String(report.week_of_month * 7).padStart(2, "0")}`;
  const attachments = db.prepare(`SELECT we.id, we.original_name FROM work_evidence we JOIN work_updates wu ON wu.id = we.work_update_id WHERE wu.user_id = ? AND wu.update_date BETWEEN ? AND ? ORDER BY we.id DESC`).all(report.user_id, evidenceStart, evidenceEnd) as Evidence[];
  const period = `${monthName(report.month)} ${report.year}, week ${report.week_of_month}`;
  const statusLabel = report.status === "seen" ? "Approved" : report.status === "changes_requested" ? "Changes requested" : "Submitted";
  const achievements = lines(report.tasks_completed);
  const challenges = lines(report.challenges);
  const nextFocus = lines(report.next_week_plan);
  const evidence = lines(report.evidence);
  return <div className="space-y-5">
    <div className="text-sm text-slate-400"><Link href="/weekly" className="hover:text-blue-600">Reports</Link>　›　<Link href="/team" className="hover:text-blue-600">Weekly Reports</Link>　›　<span className="text-slate-700">Review</span></div>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[40px] font-bold leading-none tracking-[-.045em] text-slate-950">Weekly Report Review</h1><p className="mt-2 text-[17px] text-slate-500">Review {report.name}&apos;s weekly report and provide feedback.</p></div><div className="flex gap-2"><Link href="/team" className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600">‹</Link><Link href="/team" className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600">›</Link></div></div>
    {query.reviewed && <Notice tone="green">{query.reviewed === "approved" ? "Report approved and the manager feedback has been saved." : "Changes have been requested and the feedback has been saved."}</Notice>}{query.feedback === "required" && <Notice tone="red">Add feedback before requesting changes.</Notice>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_448px]"><main className="space-y-4"><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center gap-5"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-600">{report.name.charAt(0)}</span><div className="mr-auto"><h2 className="text-lg font-bold text-slate-950">{report.name}</h2><p className="text-sm text-slate-500">{report.job_title || "Team member"}</p></div><Info icon="calendar" label="Reporting period" value={period} /><Info icon="file" label="Submitted" value={new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(report.created_at))} /><span className={`rounded-lg px-3 py-2 text-xs font-semibold ${report.status === "seen" ? "bg-emerald-50 text-emerald-700" : report.status === "changes_requested" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />{statusLabel}</span></div></section>
      <div className="flex gap-6 border-b border-slate-200"><Tab icon="file" label="Summary" active /><Tab icon="calendar" label="Daily Activity" /><Tab icon="target" label="Objectives Progress" /><Tab icon="comment" label="Manager Comments" /></div>
      <ContentCard icon="file" tone="blue" title="Weekly Summary"><p className="text-sm leading-5 text-slate-600">{report.impact || report.tasks_completed || "No weekly summary was added."}</p></ContentCard>
      <ContentCard icon="trophy" tone="green" title="Key Achievements"><BulletList items={achievements.length ? achievements : ["No completed work was recorded in this summary."]} tone="green" /></ContentCard>
      <ContentCard icon="alert" tone="red" title="Challenges / Blockers"><BulletList items={challenges.length ? challenges : ["No blockers reported this week."]} tone="red" /></ContentCard>
      <ContentCard icon="focus" tone="amber" title="Next Week Focus"><BulletList items={nextFocus.length ? nextFocus : ["No next-week focus was recorded."]} tone="amber" /></ContentCard>
      {reportDays.length > 0 && <ContentCard icon="calendar" tone="blue" title="Daily Activity"><div className="space-y-2">{reportDays.map((item) => <div key={`${item.log_date}-${item.activity}`} className="flex gap-3 text-sm"><span className="w-24 shrink-0 text-slate-400">{item.log_date.slice(5)}</span><span className="text-slate-700">{item.activity}</span></div>)}</div></ContentCard>}
    </main>
    <aside className="space-y-4"><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-950">Objectives Progress</h2><Link href="/monthly" className="text-sm font-medium text-blue-600">View all →</Link></div><div className="mt-5 space-y-5">{objectives.length ? objectives.map((objective, index) => <div key={objective.title}><div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index % 3 === 0 ? "bg-blue-50 text-blue-600" : index % 3 === 1 ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"}`}><span className="h-5 w-5"><Icon name="target" /></span></span><div className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{objective.title}</strong><span className="mt-1 block truncate text-xs text-slate-500">{objective.description}</span></div><strong className="text-sm text-slate-800">{objective.progress_percent}%</strong></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${objective.progress_percent}%` }} /></div></div>) : <p className="text-sm text-slate-500">No objective progress was attached to this report.</p>}</div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-950">Attachments</h2><span className="text-sm font-medium text-blue-600">{attachments.length} uploaded</span></div><div className="mt-3 divide-y divide-slate-100">{attachments.length ? attachments.map((item, index) => <Link key={item.id} href={`/evidence/${item.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50"><span className={`rounded-lg p-2 ${index % 2 ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"}`}><span className="block h-5 w-5"><Icon name={index % 2 ? "file" : "clip"} /></span></span><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{item.original_name}</span><span className="text-blue-600">Open</span></Link>) : evidence.length ? evidence.map((item, index) => <div key={item} className="flex items-center gap-3 py-3"><span className={`rounded-lg p-2 ${index % 2 ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"}`}><span className="block h-5 w-5"><Icon name={index % 2 ? "file" : "clip"} /></span></span><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{item}</span></div>) : <p className="py-5 text-sm text-slate-500">No evidence was attached.</p>}</div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold text-slate-950">Manager Feedback</h2><div className="mt-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{user.name.charAt(0)}</span><span><strong className="block text-sm text-slate-800">{user.name}</strong><span className="text-xs text-slate-500">Manager review</span></span></div><form className="mt-4" action={approveWeeklySummary}><input type="hidden" name="summary_id" value={report.id} /><textarea name="manager_comment" defaultValue={report.manager_comment} rows={4} placeholder="Add your feedback, questions, or requests for changes..." className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500" /><div className="mt-3 grid grid-cols-2 gap-3"><button formAction={requestWeeklySummaryChanges} className="rounded-lg border border-blue-200 px-3 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50">Request changes</button><button className="rounded-lg bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-700">Approve report</button></div></form></section>
    </aside></div>
  </div>;
}

function Info({ icon, label, value }: { icon: "calendar" | "file"; label: string; value: string }) { return <span className="flex max-w-32 gap-2 text-xs text-slate-500"><span className="h-5 w-5 shrink-0 text-slate-600"><Icon name={icon} /></span><span><span className="block text-slate-400">{label}</span>{value}</span></span>; }
function Tab({ icon, label, active = false }: { icon: "file" | "calendar" | "target" | "comment"; label: string; active?: boolean }) { return <span className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${active ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}><span className="h-5 w-5"><Icon name={icon} /></span>{label}</span>; }
function ContentCard({ icon, tone, title, children }: { icon: "file" | "trophy" | "alert" | "focus" | "calendar"; tone: "blue" | "green" | "red" | "amber"; title: string; children: React.ReactNode }) { const colors = { blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-500", amber: "bg-amber-50 text-amber-500" }; return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors[tone]}`}><span className="h-6 w-6"><Icon name={icon} /></span></span><div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-slate-950">{title}</h2><div className="mt-2">{children}</div></div></div></section>; }
function BulletList({ items, tone }: { items: string[]; tone: "green" | "red" | "amber" }) { const dots = { green: "bg-emerald-500", red: "bg-red-500", amber: "bg-amber-400" }; return <ul className="space-y-2">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-5 text-slate-600"><i className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dots[tone]}`} />{item}</li>)}</ul>; }
function Notice({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) { return <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{children}</div>; }
