import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { createObjective, toggleObjective } from "@/lib/actions";
import { Card, Field, PageHeader, Badge, inputCls, btnPrimary } from "@/components/ui";

type ObjectiveRow = { id: number; title: string; description: string; active: number; in_use: number };

export default async function ObjectivesPage() {
  const user = await requireSessionUser();
  if (user.role !== "manager" && user.role !== "admin") redirect("/");
  const db = getDb();

  const objectives = db
    .prepare(
      `SELECT o.id, o.title, o.description, o.active,
        (SELECT COUNT(*) FROM monthly_plans mp WHERE mp.objective_id = o.id) AS in_use
       FROM objectives o WHERE o.manager_id = ? ORDER BY o.active DESC, o.title`
    )
    .all(user.id) as ObjectiveRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Strategic objectives"
        subtitle="The objectives your team can pick from when planning their month. Keep the list short and meaningful — these come from the school improvement plan or your team's priorities."
      />

      <Card title="Add an objective">
        <form action={createObjective} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr_auto]">
          <Field label="Objective">
            <input name="title" required className={inputCls} placeholder="e.g. Achieve full IB compliance" />
          </Field>
          <Field label="What does success look like? (optional)">
            <input name="description" className={inputCls} placeholder="One sentence the team can aim at" />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={btnPrimary}>Add</button>
          </div>
        </form>
      </Card>

      <Card title="Your objectives">
        {objectives.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. Your team cannot plan their month until you add at least one objective.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {objectives.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${o.active ? "text-slate-800" : "text-slate-400 line-through"}`}>{o.title}</p>
                  {o.description && <p className="text-sm text-slate-500">{o.description}</p>}
                </div>
                {o.in_use > 0 && <Badge tone="blue">used in {o.in_use} plan{o.in_use === 1 ? "" : "s"}</Badge>}
                <Badge tone={o.active ? "green" : "slate"}>{o.active ? "Active" : "Retired"}</Badge>
                <form action={toggleObjective}>
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    {o.active ? "Retire" : "Reactivate"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Retiring an objective hides it from new plans; months already planned against it keep their history.
        </p>
      </Card>
    </div>
  );
}
