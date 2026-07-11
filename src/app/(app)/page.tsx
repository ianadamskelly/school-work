import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { dayCodeFor, weekOfMonth, todayISO, MONTH_NAMES } from "@/lib/rotation";
import { Card, Badge, btnPrimary } from "@/components/ui";

type FocusRow = { name: string; focus_area: string | null };

export default async function HomePage() {
  const user = await requireSessionUser();
  const db = getDb();
  const now = new Date();
  const today = todayISO();
  const code = dayCodeFor(now);
  const week = weekOfMonth(now);

  let suggestion: FocusRow | null = null;
  if (user.template_id && code) {
    suggestion =
      (db
        .prepare(
          `SELECT tc.name, fa.name AS focus_area
           FROM task_categories tc
           LEFT JOIN focus_areas fa ON fa.id = tc.focus_area_id
           WHERE tc.template_id = ? AND tc.day_code = ? AND tc.week_number = ?
           LIMIT 1`
        )
        .get(user.template_id, code, week) as FocusRow | undefined) ?? null;
  }

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const stats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
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

  const teamCount =
    user.role === "manager" || user.role === "admin"
      ? (db.prepare("SELECT COUNT(*) AS n FROM users WHERE manager_id = ? AND active = 1").get(user.id) as { n: number }).n
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Hello, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · week {week} of the month
        </p>
      </div>

      {user.template_id ? (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Suggested focus today</p>
              {suggestion ? (
                <>
                  <p className="mt-1 text-lg font-semibold text-navy-800">{suggestion.focus_area ?? suggestion.name}</p>
                  <p className="text-sm text-slate-600">{suggestion.name}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  No rotation set for today — log whatever you worked on.
                </p>
              )}
            </div>
            <Link href="/daily" className={btnPrimary}>
              Log today&apos;s work
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-600">
            Your account has no role template yet, so there is nothing to log against.
            {user.role === "admin" ? " Assign yourself a template in Admin if you also track your own work." : " Ask your administrator to assign one."}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">Tasks logged in {MONTH_NAMES[now.getMonth()]}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.total}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Completed</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.completed ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Hours this month</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{Number(stats.hours).toFixed(1)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Overdue follow-ups</p>
          <p className={`mt-1 text-2xl font-semibold ${overdue.n > 0 ? "text-red-600" : "text-slate-900"}`}>{overdue.n}</p>
          {overdue.n > 0 && (
            <Link href="/daily" className="text-xs text-navy-600 underline">
              See them
            </Link>
          )}
        </Card>
      </div>

      {(user.role === "manager" || user.role === "admin") && (
        <Card title="Your team">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {teamCount === 0
                ? "Nobody reports to you yet."
                : `${teamCount} ${teamCount === 1 ? "person reports" : "people report"} to you.`}
            </p>
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
