import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { saveWeeklySummary } from "@/lib/actions";
import { weekOfMonth, MONTH_NAMES } from "@/lib/rotation";
import { Card, Field, PageHeader, SavedNotice, inputCls, btnPrimary } from "@/components/ui";

type Option = { id: number; name: string };
type Summary = {
  focus_area_id: number | null;
  tasks_completed: string;
  evidence: string;
  challenges: string;
  solutions: string;
  people_engaged: string;
  impact: string;
  risk_level: string;
  next_week_plan: string;
};

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; year?: string; month?: string; week?: string }>;
}) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const db = getDb();
  const now = new Date();

  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;
  const week = Number(params.week) || weekOfMonth(now);

  const focusAreas = user.template_id
    ? (db.prepare("SELECT id, name FROM focus_areas WHERE template_id = ? ORDER BY sort").all(user.template_id) as Option[])
    : [];

  const existing = db
    .prepare("SELECT * FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ? AND week_of_month = ?")
    .get(user.id, year, month, week) as Summary | undefined;

  const filled = (db
    .prepare("SELECT week_of_month FROM weekly_summaries WHERE user_id = ? AND year = ? AND month = ?")
    .all(user.id, year, month) as { week_of_month: number }[]).map((r) => r.week_of_month);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My week"
        subtitle="A short summary at the end of each week: what got done, what was hard, what comes next."
      />
      <SavedNotice show={params.saved === "1"} text="Your weekly summary has been saved." />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            {MONTH_NAMES[month - 1]} {year} —
          </span>
          {[1, 2, 3, 4].map((w) => (
            <Link
              key={w}
              href={`/weekly?year=${year}&month=${month}&week=${w}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                w === week
                  ? "bg-navy-700 text-white"
                  : filled.includes(w)
                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Week {w}
              {filled.includes(w) ? " ✓" : ""}
            </Link>
          ))}
        </div>
      </Card>

      <Card title={`Week ${week} summary`}>
        <form action={saveWeeklySummary} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="week_of_month" value={week} />
          <Field label="Key focus area">
            <select name="focus_area_id" defaultValue={existing?.focus_area_id ?? ""} className={inputCls}>
              <option value="">— Choose —</option>
              {focusAreas.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Risk level this week">
            <select name="risk_level" defaultValue={existing?.risk_level ?? "Low"} className={inputCls}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Major tasks completed">
              <textarea name="tasks_completed" rows={3} defaultValue={existing?.tasks_completed} className={inputCls} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Evidence / outputs" hint="Links to documents, reports produced, minutes, photos — anything that shows the work.">
              <textarea name="evidence" rows={2} defaultValue={existing?.evidence} className={inputCls} />
            </Field>
          </div>
          <Field label="Challenges identified">
            <textarea name="challenges" rows={3} defaultValue={existing?.challenges} className={inputCls} />
          </Field>
          <Field label="Solutions proposed">
            <textarea name="solutions" rows={3} defaultValue={existing?.solutions} className={inputCls} />
          </Field>
          <Field label="People engaged">
            <input name="people_engaged" defaultValue={existing?.people_engaged} className={inputCls} placeholder="e.g. SMT, PYP coordinators, parents" />
          </Field>
          <Field label="Impact summary">
            <input name="impact" defaultValue={existing?.impact} className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Plan for next week">
              <textarea name="next_week_plan" rows={2} defaultValue={existing?.next_week_plan} className={inputCls} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Save weekly summary</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
