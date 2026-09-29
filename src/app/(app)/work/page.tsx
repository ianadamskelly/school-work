import Link from "next/link";
import { requireSessionUser } from "@/lib/auth";
import { createWorkItem, addWorkUpdate, setWorkStatus } from "@/lib/actions";
import { listWork } from "@/lib/work";
import { getMonthlyPlan } from "@/lib/plan";
import { getMonthlyWorkObjectives } from "@/lib/planning";
import { todayISO } from "@/lib/rotation";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

const VIEWS = ["today", "week", "upcoming", "blocked", "completed"] as const;
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ view?: string; saved?: string; error?: string }> }) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const view = VIEWS.includes(params.view as (typeof VIEWS)[number]) ? params.view! : "today";
  const today = todayISO();
  const items = listWork(user.id, view, today);
  const now = new Date();
  const plan = getMonthlyPlan(user.id, now.getFullYear(), now.getMonth() + 1);
  const workObjectives = plan?.status === "approved" ? getMonthlyWorkObjectives(plan.id) : [];
  const focusAreas = workObjectives.flatMap((objective) => objective.focus_areas.map((area) => ({ ...area, objectiveTitle: objective.title })));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Work" subtitle="Keep work items clear; add a quick update whenever progress happens. Reports build from these updates." />
      </div>
      <SavedNotice show={params.saved === "work"} text="Work item added." />
      <SavedNotice show={params.saved === "update"} text="Update recorded — your reports will include it." />
      {params.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">Please check the work details and try again.</div>}

      <Card title="Add work">
        <p className="mb-4 text-sm text-slate-600">Plan work ahead, record recurring responsibilities, or capture unexpected reactive work. Updates against each item build your reports.</p>
        <form action={createWorkItem} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="What needs doing?">
            <input name="title" required className={inputCls} placeholder="e.g. Resolve a staff login issue" />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="in_progress" className={inputCls}>
              <option value="planned">Planned</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option>
            </select>
          </Field>
          <Field label="Work type">
            <select name="work_type" defaultValue="planned" className={inputCls}>
              <option value="planned">Planned</option><option value="recurring">Recurring</option><option value="reactive">Reactive</option>
            </select>
          </Field>
          <Field label="Plan focus area">
            <select name="monthly_focus_area_id" defaultValue="" className={inputCls}>
              <option value="">— Reactive / operational —</option>
              {focusAreas.map((area) => <option key={area.id} value={area.id}>{area.objectiveTitle} — {area.title}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><button type="submit" className={btnPrimary}>Add work</button></div>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {VIEWS.map((name) => <Link key={name} href={`/work?view=${name}`} className={`rounded-lg px-3 py-1.5 text-sm ${view === name ? "bg-navy-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label(name)}</Link>)}
      </div>

      <Card title={view === "week" ? "This week’s work" : label(view)}>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing here yet. Add planned work or log an unexpected task above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <Badge tone={item.work_type === "reactive" ? "amber" : item.work_type === "recurring" ? "blue" : "slate"}>{item.work_type}</Badge>
                      <Badge tone={item.status === "completed" ? "green" : item.status === "blocked" ? "red" : item.status === "in_progress" ? "blue" : "slate"}>{label(item.status)}</Badge>
                      {item.open_blockers > 0 && <Badge tone="red">{item.open_blockers} blocker{item.open_blockers === 1 ? "" : "s"}</Badge>}
                    </div>
                    {item.objective_title && <p className="mt-1 text-xs text-slate-500">Objective: {item.objective_title}{item.focus_area ? ` · Focus: ${item.focus_area}` : ""}</p>}
                    {item.due_date && <p className="mt-1 text-xs text-slate-500">Due {item.due_date}</p>}
                    {item.latest_update && <p className="mt-2 text-sm text-slate-600">Latest: {item.latest_update}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <form action={setWorkStatus}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="status" value="completed" /><button type="submit" className={btnSecondary}>Complete</button></form>
                    <details className="group">
                      <summary className={`${btnSecondary} list-none`}>Add update</summary>
                      <form action={addWorkUpdate} className="mt-2 w-80 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <input type="hidden" name="work_item_id" value={item.id} /><input type="hidden" name="return_to" value="/work" />
                        <textarea name="text" required rows={2} className={inputCls} placeholder="What changed?" />
                        <select name="status" defaultValue={item.status} className={inputCls}>{["planned", "in_progress", "blocked", "completed", "deferred"].map((state) => <option key={state} value={state}>{label(state)}</option>)}</select>
                        <button type="submit" className={btnPrimary}>Save update</button>
                      </form>
                    </details>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
