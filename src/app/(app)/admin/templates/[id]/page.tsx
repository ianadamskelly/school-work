import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { addFocusArea, addTaskCategory, addTorArea, addDepartment, deleteTemplateItem } from "@/lib/actions";
import { Card, Field, PageHeader, Badge, inputCls, btnPrimary } from "@/components/ui";

type Template = { id: number; name: string; description: string };
type Focus = { id: number; name: string };
type Category = { id: number; name: string; day_code: string | null; week_number: number | null; focus_area: string | null };
type Item = { id: number; name: string };

function DeleteButton({ templateId, table, id }: { templateId: number; table: string; id: number }) {
  return (
    <form action={deleteTemplateItem} className="inline">
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-slate-400 hover:text-red-600 cursor-pointer" title="Remove">
        ✕
      </button>
    </form>
  );
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user.role !== "admin") redirect("/");
  const { id } = await params;
  const db = getDb();

  const template = db.prepare("SELECT id, name, description FROM templates WHERE id = ?").get(Number(id)) as
    | Template
    | undefined;
  if (!template) notFound();

  const focusAreas = db
    .prepare("SELECT id, name FROM focus_areas WHERE template_id = ? ORDER BY sort")
    .all(template.id) as Focus[];
  const categories = db
    .prepare(
      `SELECT tc.id, tc.name, tc.day_code, tc.week_number, fa.name AS focus_area
       FROM task_categories tc LEFT JOIN focus_areas fa ON fa.id = tc.focus_area_id
       WHERE tc.template_id = ? ORDER BY tc.day_code, tc.week_number, tc.sort`
    )
    .all(template.id) as Category[];
  const torAreas = db
    .prepare("SELECT id, name FROM tor_areas WHERE template_id = ? ORDER BY sort")
    .all(template.id) as Item[];
  const departments = db
    .prepare("SELECT id, name FROM departments WHERE template_id = ? ORDER BY sort")
    .all(template.id) as Item[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Template: ${template.name}`}
        subtitle={template.description || "Task categories carry an optional rotation slot (day code A/B/C plus week of the month) that powers the daily suggestion."}
      />

      <Card title="Task categories and rotation">
        {categories.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">No task categories yet — add the main duties from the job description below.</p>
        ) : (
          <ul className="mb-4 divide-y divide-slate-100">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1 text-sm font-medium text-slate-800">{c.name}</span>
                {c.focus_area && <Badge tone="blue">{c.focus_area}</Badge>}
                {c.day_code && c.week_number && <Badge>Day {c.day_code} · week {c.week_number}</Badge>}
                <DeleteButton templateId={template.id} table="task_categories" id={c.id} />
              </li>
            ))}
          </ul>
        )}
        <form action={addTaskCategory} className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="template_id" value={template.id} />
          <div className="lg:col-span-2">
            <Field label="New task category">
              <input name="name" required className={inputCls} placeholder="e.g. Lesson planning and delivery" />
            </Field>
          </div>
          <Field label="Focus area">
            <select name="focus_area_id" defaultValue="" className={inputCls}>
              <option value="">— None —</option>
              {focusAreas.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Day code">
            <select name="day_code" defaultValue="" className={inputCls}>
              <option value="">—</option>
              <option>A</option>
              <option>B</option>
              <option>C</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Week">
              <select name="week_number" defaultValue="" className={inputCls}>
                <option value="">—</option>
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </Field>
            <button type="submit" className={btnPrimary}>Add</button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Focus areas">
          <ul className="mb-3 space-y-1">
            {focusAreas.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm text-slate-700">
                {f.name}
                <DeleteButton templateId={template.id} table="focus_areas" id={f.id} />
              </li>
            ))}
          </ul>
          <form action={addFocusArea} className="flex gap-2">
            <input type="hidden" name="template_id" value={template.id} />
            <input name="name" required className={inputCls} placeholder="New focus area" />
            <button type="submit" className={btnPrimary}>Add</button>
          </form>
        </Card>

        <Card title="Monthly TOR areas">
          <ul className="mb-3 space-y-1">
            {torAreas.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm text-slate-700">
                {t.name}
                <DeleteButton templateId={template.id} table="tor_areas" id={t.id} />
              </li>
            ))}
          </ul>
          <form action={addTorArea} className="flex gap-2">
            <input type="hidden" name="template_id" value={template.id} />
            <input name="name" required className={inputCls} placeholder="New TOR area" />
            <button type="submit" className={btnPrimary}>Add</button>
          </form>
        </Card>

        <Card title="Departments / sections">
          <ul className="mb-3 space-y-1">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm text-slate-700">
                {d.name}
                <DeleteButton templateId={template.id} table="departments" id={d.id} />
              </li>
            ))}
          </ul>
          <form action={addDepartment} className="flex gap-2">
            <input type="hidden" name="template_id" value={template.id} />
            <input name="name" required className={inputCls} placeholder="New department" />
            <button type="submit" className={btnPrimary}>Add</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
