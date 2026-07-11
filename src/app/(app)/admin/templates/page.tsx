import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { createTemplate } from "@/lib/actions";
import { Card, Field, PageHeader, inputCls, btnPrimary } from "@/components/ui";

type TemplateRow = { id: number; name: string; description: string; people: number; categories: number };

export default async function TemplatesPage() {
  const user = await requireSessionUser();
  if (user.role !== "admin") redirect("/");
  const db = getDb();

  const templates = db
    .prepare(
      `SELECT t.id, t.name, t.description,
        (SELECT COUNT(*) FROM users u WHERE u.template_id = t.id AND u.active = 1) AS people,
        (SELECT COUNT(*) FROM task_categories tc WHERE tc.template_id = t.id) AS categories
       FROM templates t ORDER BY t.name`
    )
    .all() as TemplateRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role templates"
        subtitle="A template is a job description broken into task categories, focus areas, and monthly TOR areas. Build it once, assign it to everyone with that role."
      />

      <Card title="Create a template">
        <form action={createTemplate} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr_auto]">
          <Field label="Role name">
            <input name="name" required className={inputCls} placeholder="e.g. PYP Teacher" />
          </Field>
          <Field label="Short description">
            <input name="description" className={inputCls} placeholder="What this role covers" />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={btnPrimary}>Create</button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Link key={t.id} href={`/admin/templates/${t.id}`} className="block">
            <Card className="h-full transition hover:border-navy-600">
              <p className="font-semibold text-slate-900">{t.name}</p>
              {t.description && <p className="mt-1 text-sm text-slate-600">{t.description}</p>}
              <p className="mt-3 text-xs text-slate-500">
                {t.categories} task categories · {t.people} {t.people === 1 ? "person" : "people"} assigned
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
