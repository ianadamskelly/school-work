import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { weekOfMonth, todayISO, MONTH_NAMES } from "@/lib/rotation";
import { getMonthlyPlan, getPlanObjectives, getWeekFocus } from "@/lib/plan";
import { Card, Badge, btnPrimary } from "@/components/ui";

export default async function HomePage() {
  const user = await requireSessionUser();
  const db = getDb();
  const now = new Date();
  const today = todayISO();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const week = weekOfMonth(now);

  const plan = user.template_id ? getMonthlyPlan(user.id, year, month) : null;
  const planObjectives = plan ? getPlanObjectives(plan.id) : [];
  const weekFocus = plan?.status === "approved" ? getWeekFocus(user.id, year, month, week) : [];

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
              COALESCE(SUM(hours), 0) AS hours
       FROM daily_logs WHERE user_id = ? AND log_date >= ?`
    )
    .get(user.id, monthStart) as { total: number; completed: number; hours: number };

  const overdue = db
    .prepare(
      `SELECT COUNT(*) AS n FROM daily_logs
       WHERE user_id = ? AND followup_required = 1 AND status != 'Completed'
         AND followup_date IS NOT NULL AND followup_date < ?`
    )
    .get(user.id, today) as { n: number };

  const weekReports = db
    .prepare(
      "SELECT week_of_month, status, progress_percent FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? ORDER BY week_of_month"
    )
    .all(user.id, year, month) as { week_of_month: number; status: string; progress_percent: number | null }[];
  const latestProgress = [...weekReports].reverse().find((w) => w.progress_percent !== null)?.progress_percent;

  const teamCount =
    user.role === "manager" || user.role === "admin"
      ? (db.prepare("SELECT COUNT(*) AS n FROM users WHERE manager_id = ? AND active = 1").get(user.id) as { n: number }).n
      : 0;
  const pendingApprovals =
    teamCount > 0
      ? (db
          .prepare(
            `SELECT COUNT(*) AS n FROM monthly_plans mp JOIN users u ON u.id = mp.user_id
             WHERE u.manager_id = ? AND mp.status = 'proposed'`
          )
          .get(user.id) as { n: number }).n
      : 0;
  const unseenWeeklies =
    teamCount > 0
      ? (db
          .prepare(
            `SELECT COUNT(*) AS n FROM weekly_summaries ws JOIN users u ON u.id = ws.user_id
             WHERE u.manager_id = ? AND ws.status = 'submitted'`
          )
          .get(user.id) as { n: number }).n
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hello, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · week {week} of the month
        </p>
      </div>

      {user.template_id && (
        !plan ? (
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{MONTH_NAMES[month - 1]}</p>
                <p className="mt-1 text-sm text-slate-700">
                  You have not set a strategic objective for this month yet. That is the first step — everything else follows it.
                </p>
              </div>
              <Link href="/monthly" className={btnPrimary}>Plan my month</Link>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This month&apos;s objective</p>
              <Badge tone={plan.status === "approved" ? "green" : "amber"}>
                {plan.status === "approved" ? "Approved" : "Waiting for approval"}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {planObjectives.map((objective) => <Badge key={objective.id} tone="blue">{objective.title}</Badge>)}
            </div>
            {plan.status === "approved" && (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {weekFocus.length > 0 ? (
                    <>
                      <span className="text-xs text-slate-500">This week:</span>
                      {weekFocus.map((f) => (
                        <Badge key={f.id} tone="blue">{f.name}</Badge>
                      ))}
                    </>
                  ) : (
                    <Link href="/weekly" className="text-sm font-medium text-navy-600 underline">
                      Pick this week&apos;s focus areas →
                    </Link>
                  )}
                  {latestProgress != null && <Badge tone="green">{latestProgress}% progress</Badge>}
                </div>
                <Link href="/daily" className={btnPrimary}>Log today&apos;s work</Link>
              </div>
            )}
          </Card>
        )
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">Tasks logged in {MONTH_NAMES[month - 1]}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.total}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Weekly reports sent</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {weekReports.filter((w) => w.status !== "draft").length}<span className="text-sm text-slate-400"> / {week}</span>
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Hours this month</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{Number(stats.hours).toFixed(1)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Overdue follow-ups</p>
          <p className={`mt-1 text-2xl font-semibold ${overdue.n > 0 ? "text-red-600" : "text-slate-900"}`}>{overdue.n}</p>
          {overdue.n > 0 && (
            <Link href="/daily" className="text-xs text-navy-600 underline">See them</Link>
          )}
        </Card>
      </div>

      {(user.role === "manager" || user.role === "admin") && (
        <Card title="Your team">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {teamCount === 0 ? (
                "Nobody reports to you yet."
              ) : (
                <>
                  <span>{teamCount} {teamCount === 1 ? "person" : "people"}</span>
                  {pendingApprovals > 0 && <Badge tone="amber">{pendingApprovals} plan{pendingApprovals === 1 ? "" : "s"} to approve</Badge>}
                  {unseenWeeklies > 0 && <Badge tone="blue">{unseenWeeklies} weekly report{unseenWeeklies === 1 ? "" : "s"} to read</Badge>}
                </>
              )}
            </div>
            <Link href="/team" className="text-sm font-medium text-navy-600 hover:underline">
              Open team dashboard →
            </Link>
          </div>
        </Card>
      )}

      {overdue.n > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Badge tone="amber">Reminder</Badge>{" "}
          You have {overdue.n} follow-up{overdue.n === 1 ? "" : "s"} past the due date. Open{" "}
          <Link href="/daily" className="font-medium underline">My day</Link> to close them off.
        </div>
      )}
    </div>
  );
}
