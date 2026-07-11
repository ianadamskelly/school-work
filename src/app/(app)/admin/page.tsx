import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { createUser, updateUser } from "@/lib/actions";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  job_title: string;
  manager_id: number | null;
  template_id: number | null;
  active: number;
};
type Option = { id: number; name: string };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireSessionUser();
  if (user.role !== "admin") redirect("/");
  const params = await searchParams;
  const db = getDb();

  const users = db
    .prepare("SELECT id, name, email, role, job_title, manager_id, template_id, active FROM users ORDER BY name")
    .all() as UserRow[];
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const templates = db.prepare("SELECT id, name FROM templates ORDER BY name").all() as Option[];

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" subtitle="Add people, set who reports to whom, and manage role templates." />
      <SavedNotice show={params.saved === "1"} />
      {params.error === "email" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          That email address is already in use.
        </div>
      )}
      {params.error === "invalid" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Please fill in a name, an email, and a password of at least 6 characters.
        </div>
      )}

      <Card title="Role templates">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {templates.length} template{templates.length === 1 ? "" : "s"}: {templates.map((t) => t.name).join(", ") || "none yet"}
          </p>
          <Link href="/admin/templates" className={btnSecondary}>Manage templates</Link>
        </div>
      </Card>

      <Card title="Add a person">
        <form action={createUser} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input name="name" required className={inputCls} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required className={inputCls} />
          </Field>
          <Field label="Temporary password" hint="At least 6 characters. Share it with them privately; you can reset it later.">
            <input name="password" required minLength={6} className={inputCls} />
          </Field>
          <Field label="Job title">
            <input name="job_title" className={inputCls} placeholder="e.g. PYP Teacher" />
          </Field>
          <Field label="Role in the system">
            <select name="role" defaultValue="employee" className={inputCls}>
              <option value="employee">Employee</option>
              <option value="manager">Line manager</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Reports to">
            <select name="manager_id" defaultValue="" className={inputCls}>
              <option value="">— Nobody —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Role template" hint="What their work is logged against. Line managers who also track their own work need one too.">
            <select name="template_id" defaultValue="" className={inputCls}>
              <option value="">— None —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button type="submit" className={btnPrimary}>Add person</button>
          </div>
        </form>
      </Card>

      <Card title="Everyone">
        <div className="space-y-3">
          {users.map((u) => (
            <details key={u.id} className="rounded-lg border border-slate-200">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                <span className="font-medium text-slate-900">{u.name}</span>
                <span className="text-sm text-slate-500">{u.email}</span>
                <Badge tone={u.role === "admin" ? "red" : u.role === "manager" ? "blue" : "slate"}>{u.role}</Badge>
                {!u.active && <Badge tone="amber">deactivated</Badge>}
              </summary>
              <form action={updateUser} className="grid grid-cols-1 gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={u.id} />
                <Field label="Role in the system">
                  <select name="role" defaultValue={u.role} className={inputCls}>
                    <option value="employee">Employee</option>
                    <option value="manager">Line manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
                <Field label="Job title">
                  <input name="job_title" defaultValue={u.job_title} className={inputCls} />
                </Field>
                <Field label="Reports to">
                  <select name="manager_id" defaultValue={u.manager_id ?? ""} className={inputCls}>
                    <option value="">— Nobody —</option>
                    {managers
                      .filter((m) => m.id !== u.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
                </Field>
                <Field label="Role template">
                  <select name="template_id" defaultValue={u.template_id ?? ""} className={inputCls}>
                    <option value="">— None —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Reset password (leave blank to keep current)">
                  <input name="new_password" className={inputCls} placeholder="New password" />
                </Field>
                <div className="flex items-end justify-between gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input name="active" type="checkbox" defaultChecked={u.active === 1} className="h-4 w-4 rounded border-slate-300" />
                    Active account
                  </label>
                  <button type="submit" className={btnPrimary}>Save changes</button>
                </div>
              </form>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
