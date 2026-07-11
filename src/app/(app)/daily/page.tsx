import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { addDailyLog, setDailyStatus, deleteDailyLog } from "@/lib/actions";
import { dayCodeFor, weekOfMonth, todayISO } from "@/lib/rotation";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary } from "@/components/ui";

type Option = { id: number; name: string };
type LogRow = {
  id: number;
  log_date: string;
  activity: string;
  category: string | null;
  department: string | null;
  hours: number;
  outcome: string;
  followup_required: number;
  followup_date: string | null;
  priority: string;
  status: string;
};

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const db = getDb();
  const today = todayISO();
  const now = new Date();

  const categories = user.template_id
    ? (db
        .prepare("SELECT id, name FROM task_categories WHERE template_id = ? ORDER BY sort")
        .all(user.template_id) as Option[])
    : [];
  const departments = user.template_id
    ? (db
        .prepare("SELECT id, name FROM departments WHERE template_id = ? ORDER BY sort")
        .all(user.template_id) as Option[])
    : [];

  const code = dayCodeFor(now);
  const week = weekOfMonth(now);
  const suggested =
    user.template_id && code
      ? (db
          .prepare("SELECT id FROM task_categories WHERE template_id = ? AND day_code = ? AND week_number = ?")
          .get(user.template_id, code, week) as { id: number } | undefined)
      : undefined;

  const logs = db
    .prepare(
      `SELECT dl.id, dl.log_date, dl.activity, tc.name AS category, d.name AS department,
              dl.hours, dl.outcome, dl.followup_required, dl.followup_date, dl.priority, dl.status
       FROM daily_logs dl
       LEFT JOIN task_categories tc ON tc.id = dl.category_id
       LEFT JOIN departments d ON d.id = dl.department_id
       WHERE dl.user_id = ?
       ORDER BY dl.log_date DESC, dl.id DESC
       LIMIT 60`
    )
    .all(user.id) as LogRow[];

  const isOverdue = (l: LogRow) =>
    l.followup_required === 1 && l.status !== "Completed" && !!l.followup_date && l.followup_date < today;

  return (
    <div className="space-y-6">
      <PageHeader title="My day" subtitle="Log what you worked on. Short entries are fine — a minute is all it should take." />
      <SavedNotice show={params.saved === "1"} text="Your entry has been saved." />

      <Card title="Add an entry">
        <form action={addDailyLog} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input name="log_date" type="date" defaultValue={today} required className={inputCls} />
          </Field>
          <Field label="Task category" hint={suggested ? "Pre-selected from today's rotation — change it if you worked on something else." : undefined}>
            <select name="category_id" defaultValue={suggested?.id ?? ""} className={inputCls}>
              <option value="">— Choose —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="What did you do?">
              <input name="activity" required placeholder="e.g. Reviewed Term 2 assessment plans with MYP coordinators" className={inputCls} />
            </Field>
          </div>
          <Field label="Department / section">
            <select name="department_id" defaultValue="" className={inputCls}>
              <option value="">— Choose —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Time spent (hours)">
            <input name="hours" type="number" step="0.25" min="0" max="24" defaultValue="1" className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Outcome / notes (optional)">
              <textarea name="outcome" rows={2} className={inputCls} placeholder="What came out of it?" />
            </Field>
          </div>
          <Field label="Priority">
            <select name="priority" defaultValue="Medium" className={inputCls}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="Completed" className={inputCls}>
              <option>Completed</option>
              <option>In Progress</option>
              <option>Pending</option>
            </select>
          </Field>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="followup_required" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
              Needs a follow-up
            </label>
          </div>
          <Field label="Follow-up date (if needed)">
            <input name="followup_date" type="date" className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}>Save entry</button>
          </div>
        </form>
      </Card>

      <Card title="Recent entries">
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing logged yet. Your entries will appear here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">{l.log_date}</span>
                    {l.category && <Badge tone="blue">{l.category}</Badge>}
                    {l.department && <Badge>{l.department}</Badge>}
                    <Badge tone={l.status === "Completed" ? "green" : l.status === "In Progress" ? "amber" : "slate"}>
                      {l.status}
                    </Badge>
                    {isOverdue(l) && <Badge tone="red">Overdue follow-up: {l.followup_date}</Badge>}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{l.activity}</p>
                  {l.outcome && <p className="text-sm text-slate-600">{l.outcome}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">{l.hours} h · {l.priority} priority</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {l.status !== "Completed" && (
                    <form action={setDailyStatus}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="status" value="Completed" />
                      <button type="submit" className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                        Mark completed
                      </button>
                    </form>
                  )}
                  <form action={deleteDailyLog}>
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 cursor-pointer">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
