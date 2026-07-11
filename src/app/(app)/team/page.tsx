import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { todayISO } from "@/lib/rotation";
import { Card, PageHeader, Badge } from "@/components/ui";

type Member = {
  id: number;
  name: string;
  job_title: string;
  manager_name: string | null;
  logs_month: number;
  hours_month: number;
  overdue: number;
  review_status: string | null;
  pending_reviews: number;
};

export default async function TeamPage() {
  const user = await requireSessionUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");

  const db = getDb();
  const now = new Date();
  const today = todayISO();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const scope =
    user.role === "admin"
      ? "u.template_id IS NOT NULL AND u.active = 1"
      : "u.manager_id = ? AND u.active = 1";
  const scopeArgs = user.role === "admin" ? [] : [user.id];

  const members = db
    .prepare(
      `SELECT u.id, u.name, u.job_title, m.name AS manager_name,
        (SELECT COUNT(*) FROM daily_logs dl WHERE dl.user_id = u.id AND dl.log_date >= ?) AS logs_month,
        (SELECT COALESCE(SUM(hours),0) FROM daily_logs dl WHERE dl.user_id = u.id AND dl.log_date >= ?) AS hours_month,
        (SELECT COUNT(*) FROM daily_logs dl WHERE dl.user_id = u.id AND dl.followup_required = 1
           AND dl.status != 'Completed' AND dl.followup_date IS NOT NULL AND dl.followup_date < ?) AS overdue,
        (SELECT mr.status FROM monthly_reviews mr WHERE mr.user_id = u.id
           ORDER BY mr.year DESC, mr.month DESC LIMIT 1) AS review_status,
        (SELECT COUNT(*) FROM monthly_reviews mr WHERE mr.user_id = u.id AND mr.status = 'submitted') AS pending_reviews
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       WHERE ${scope}
       ORDER BY u.name`
    )
    .all(monthStart, monthStart, today, ...scopeArgs) as Member[];

  const totalPending = members.reduce((s, m) => s + m.pending_reviews, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.role === "admin" ? "All staff" : "My team"}
        subtitle="How each person is tracking this month. Click a name for their full record."
      />

      {totalPending > 0 && (
        <div className="rounded-xl border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-800">
          {totalPending === 1
            ? "1 monthly review is waiting for your sign-off"
            : `${totalPending} monthly reviews are waiting for your sign-off`}{" "}
          — look for the &quot;Needs review&quot; badge below.
        </div>
      )}

      {members.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Nobody reports to you yet. Ask your administrator to assign staff to you.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {members.map((m) => (
            <Link key={m.id} href={`/team/${m.id}`} className="block">
              <Card className="h-full transition hover:border-navy-600">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.job_title || "—"}</p>
                    {user.role === "admin" && m.manager_name && (
                      <p className="text-xs text-slate-400">Reports to {m.manager_name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {m.pending_reviews > 0 && <Badge tone="blue">Needs review</Badge>}
                    {m.overdue > 0 && <Badge tone="red">{m.overdue} overdue</Badge>}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{m.logs_month}</p>
                    <p className="text-xs text-slate-500">tasks this month</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{Number(m.hours_month).toFixed(0)}</p>
                    <p className="text-xs text-slate-500">hours logged</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{m.review_status ?? "—"}</p>
                    <p className="text-xs text-slate-500">latest month</p>
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
