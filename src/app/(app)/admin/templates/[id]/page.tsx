import Link from "next/link";
import { updateTemplate } from "@/lib/actions";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { addFocusArea, addTaskCategory, addTorArea, addDepartment, deleteTemplateItem } from "@/lib/actions";
import { Field, Badge, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

type Template = { id: number; name: string; description: string };
type Focus = { id: number; name: string };
type Category = { id: number; name: string; focus_area: string | null };
type Item = { id: number; name: string };

function DeleteButton({ templateId, table, id }: { templateId: number; table: string; id: number }) {
  return <form action={deleteTemplateItem}><input type="hidden" name="template_id" value={templateId} /><input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><button type="submit" className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer" title="Remove item">Remove</button></form>;
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p><div className="mt-4">{children}</div></section>;
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user.role !== "admin") redirect("/");
  const { id } = await params;
  const db = getDb();
  const template = db.prepare("SELECT id, name, description FROM templates WHERE id = ?").get(Number(id)) as Template | undefined;
  if (!template) notFound();
  const focusAreas = db.prepare("SELECT id, name FROM focus_areas WHERE template_id = ? ORDER BY sort").all(template.id) as Focus[];
  const categories = db.prepare("SELECT tc.id, tc.name, fa.name AS focus_area FROM task_categories tc LEFT JOIN focus_areas fa ON fa.id = tc.focus_area_id WHERE tc.template_id = ? ORDER BY tc.sort").all(template.id) as Category[];
  const torAreas = db.prepare("SELECT id, name FROM tor_areas WHERE template_id = ? ORDER BY sort").all(template.id) as Item[];
  const departments = db.prepare("SELECT id, name FROM departments WHERE template_id = ? ORDER BY sort").all(template.id) as Item[];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/admin/templates" className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to role templates</Link><h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{template.name}</h1><p className="mt-2 max-w-3xl text-base text-slate-500">{template.description || "Define the work that connects this role’s daily activity to focused objectives and reviews."}</p></div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-right"><p className="text-2xl font-bold text-slate-950">{categories.length}</p><p className="text-xs font-medium text-blue-700">default responsibilities</p></div>
    </div>
    <details className="rounded-xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-semibold text-blue-600">Edit template name and description</summary><form action={updateTemplate} className="mt-4 space-y-3"><input type="hidden" name="template_id" value={template.id} /><label className="block text-sm">Name<input name="name" required defaultValue={template.name} className={inputCls} /></label><label className="block text-sm">Description<textarea name="description" defaultValue={template.description} className={inputCls} /></label><button className={btnPrimary}>Save template</button></form></details>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-sm text-slate-500">Focus areas</p><p className="mt-1 text-3xl font-bold text-slate-950">{focusAreas.length}</p><p className="mt-2 text-xs text-emerald-600">Used for weekly work focus</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-sm text-slate-500">Review areas</p><p className="mt-1 text-3xl font-bold text-slate-950">{torAreas.length}</p><p className="mt-2 text-xs text-blue-600">Guides monthly reflection</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><p className="text-sm text-slate-500">Departments</p><p className="mt-1 text-3xl font-bold text-slate-950">{departments.length}</p><p className="mt-2 text-xs text-violet-600">Available role placement</p></div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
      <SectionCard title="Default responsibilities" subtitle="Staff work categories are available in daily updates and linked to focus areas.">
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{categories.length === 0 ? <p className="p-4 text-sm text-slate-500">No responsibilities yet. Add the core duties of this role below.</p> : categories.map((category, index) => <div key={category.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span><span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{category.name}</span>{category.focus_area ? <Badge tone="blue">{category.focus_area}</Badge> : <Badge tone="amber">Unlinked</Badge>}<DeleteButton templateId={template.id} table="task_categories" id={category.id} /></div>)}</div>
        <form action={addTaskCategory} className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-4"><input type="hidden" name="template_id" value={template.id} /><p className="mb-3 text-sm font-semibold text-slate-800">Add a responsibility</p><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"><Field label="Responsibility"><input name="name" required className={inputCls} placeholder="e.g. Maintain school network" /></Field><Field label="Focus area"><select name="focus_area_id" defaultValue="" className={inputCls}><option value="">— None —</option>{focusAreas.map((focus) => <option key={focus.id} value={focus.id}>{focus.name}</option>)}</select></Field><div className="flex items-end"><button type="submit" className={btnPrimary}>Add</button></div></div></form>
      </SectionCard>
      <div className="space-y-5">
        <SectionCard title="Focus areas" subtitle="High-level workstreams for planning and weekly reporting."><div className="space-y-2">{focusAreas.length === 0 ? <p className="text-sm text-slate-500">No focus areas set.</p> : focusAreas.map((focus) => <div key={focus.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="h-2 w-2 rounded-full bg-blue-500" /><span className="flex-1 text-sm font-medium text-slate-700">{focus.name}</span><DeleteButton templateId={template.id} table="focus_areas" id={focus.id} /></div>)}</div><form action={addFocusArea} className="mt-3 flex gap-2"><input type="hidden" name="template_id" value={template.id} /><input name="name" required className={inputCls} placeholder="New focus area" /><button type="submit" className={btnPrimary}>Add</button></form></SectionCard>
        <SectionCard title="Monthly review areas" subtitle="Prompts that keep review discussions consistent."><div className="space-y-2">{torAreas.length === 0 ? <p className="text-sm text-slate-500">No review areas set.</p> : torAreas.map((area) => <div key={area.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="h-2 w-2 rounded-full bg-violet-500" /><span className="flex-1 text-sm font-medium text-slate-700">{area.name}</span><DeleteButton templateId={template.id} table="tor_areas" id={area.id} /></div>)}</div><form action={addTorArea} className="mt-3 flex gap-2"><input type="hidden" name="template_id" value={template.id} /><input name="name" required className={inputCls} placeholder="New review area" /><button type="submit" className={btnPrimary}>Add</button></form></SectionCard>
        <SectionCard title="Departments / sections" subtitle="Where this role template can be used."><div className="mb-3 flex flex-wrap gap-2">{departments.length === 0 ? <p className="text-sm text-slate-500">No departments set.</p> : departments.map((department) => <span key={department.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">{department.name}<DeleteButton templateId={template.id} table="departments" id={department.id} /></span>)}</div><form action={addDepartment} className="flex gap-2"><input type="hidden" name="template_id" value={template.id} /><input name="name" required className={inputCls} placeholder="New department" /><button type="submit" className={btnPrimary}>Add</button></form></SectionCard>
      </div>
    </div>
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500"><span>Changes take effect immediately for staff using this role template.</span><Link href="/admin/templates" className={btnSecondary}>Done</Link></div>
  </div>;
}
