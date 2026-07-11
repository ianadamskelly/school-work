import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { todayISO } from "@/lib/rotation";
import { Card, PageHeader, Badge, btnSecondary } from "@/components/ui";

type Member = {
  id: number;
  name: string;
  job_title: string;
  manager_name: string | null;
  objective_title: string | null;
  plan_status: string | null;
  logs_month: number;
  hours_month: number;
  overdue: number;
  weeklies_submitted: number;
  latest_progress: number | null;
  pending_reviews: number;
};

export default async function TeamPage() {
  const user = await requireSessionUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");

  const db = getDb();
  const now = new Date();
  const today = todayISO();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  const scope =
    user.role === "admin" ? "u.template_id IS NOT NULL AND u.active = 1" : "u.manager_id = ? AND u.active = 1";
  const scopeArgs = user.role === "admin" ? [] : [user.id];

  const members = db
    .prepare(
      `SELECT u.id, u.name, u.job_title, m.name AS manager_name,
        (SELECT o.title FROM monthly_plans mp JOIN objectives o ON o.id = mp.objective_id
           WHERE mp.user_id = u.id AND mp.year = ? AND mp.month = ?) AS objective_title,
        (SELECT mp.status FROM monthly_plans mp
           WHERE mp.user_id = u.id AND mp.year = ? AND mp.month = ?) AS plan_status,
        (SELECT COUNT(*) FROM daily_logs dl WHERE dl.user_id = u.id AND dl.log_date >= ?) AS logs_month,
        (SELECT COALESCE(SUM(hours),0) FROM daily_logs dl WHERE dl.user_id = u.id AND dl.log_date >= ?) AS hours_month,
        (SELECT COUNT(*) FROM daily_logs dl WHERE dl.user_id = u.id AND dl.followup_required = 1
           AND dl.status != 'Completed' AND dl.followup_date IS NOT NULL AND dl.followup_date < ?) AS overdue,
        (SELECT COUNT(*) FROM weekly_summaries ws WHERE ws.user_id = u.id AND ws.status = 'submitted') AS weeklies_submitted,
        (SELECT ws.progress_percent FROM weekly_summaries ws
           WHERE ws.user_id = u.id AND ws.year = ? AND ws.month = ? AND ws.progress_percent IS NOT NULL
           ORDER BY ws.week_of_month DESC LIMIT 1) AS latest_progress,
        (SELECT COUNT(*) FROM monthly_reviews mr WHERE mr.user_id = u.id AND mr.status = 'submitted') AS pending_reviews
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       WHERE ${scope}
       ORDER BY u.name`
    )
    .all(year, month, year, month, monthStart, monthStart, today, year, month, ...scopeArgs) as Member[];

  const plansToApprove = members.filter((m) => m.plan_status === "proposed").length;
  const weekliesToRead = members.reduce((s, m) => s + m.weeklies_submitted, 0);
  const reviewsToSign = members.reduce((s, m) => s + m.pending_reviews, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={user.role === "admin" ? "All staff" : "My team"}
          subtitle="Each person's month at a glance. Click a name for their full record."
        />
        <Link href="/team/objectives" className={btnSecondary}>Strategic objectives</Link>
      </div>

      {(plansToApprove > 0 || weekliesToRead > 0 || reviewsToSign > 0) && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-800">
          <span className="font-medium">Waiting for you:</span>
          {plansToApprove > 0 && <Badge tone="amber">{plansToApprove} monthly plan{plansToApprove === 1 ? "" : "s"} to approve</Badge>}
          {weekliesToRead > 0 && <Badge tone="blue">{weekliesToRead} weekly report{weekliesToRead === 1 ? "" : "s"} to read</Badge>}
          {reviewsToSign > 0 && <Badge tone="green">{reviewsToSign} monthly review{reviewsToSign === 1 ? "" : "s"} to sign off</Badge>}
        </div>
      )}

      {members.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">Nobody reports to you yet. Ask your administrator to assign staff to you.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {members.map((m) => (
            <Link key={m.id} href={`/team/${m.id}`} className="block">
              <Card className="h-full transition hover:border-navy-600">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.job_title || "—"}</p>
                    {user.role === "admin" && m.manager_name && (
                      <p className="text-xs text-slate-400">Reports to {m.manager_name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {m.plan_status === "proposed" && <Badge tone="amber">Plan to approve</Badge>}
                    {m.weeklies_submitted > 0 && <Badge tone="blue">{m.weeklies_submitted} weekly to read</Badge>}
                    {m.pending_reviews > 0 && <Badge tone="green">Month to sign off</Badge>}
                    {m.overdue > 0 && <Badge tone="red">{m.overdue} overdue</Badge>}
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {m.objective_title ? (
                    <p className="truncate text-sm text-slate-700">
                      <span className="text-xs uppercase tracking-wide text-slate-400">Objective: </span>
                      {m.objective_title}
                    </p>
                  ) : (
                    <p className="text-sm italic text-slate-400">No plan for this month yet</p>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{m.logs_month}</p>
                    <p className="text-xs text-slate-500">tasks this month</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{Number(m.hours_month).toFixed(0)}</p>
                    <p className="text-xs text-slate-500">hours logged</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{m.latest_progress != null ? `${m.latest_progress}%` : "—"}</p>
                    <p className="text-xs text-slate-500">objective progress</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
