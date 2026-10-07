import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

type Person = { id: number; name: string; job_title: string; manager_id: number | null; active: number };
export default async function OrganisationPage() {
  const user = await requireSessionUser();
  if (user.role !== "admin") redirect("/");
  const people = getDb().prepare("SELECT id,name,job_title,manager_id,active FROM users ORDER BY name").all() as Person[];
  function branch(person: Person, ancestors: Set<number>): React.ReactNode {
    if (ancestors.has(person.id)) return <p className="text-red-600">Circular reporting relationship: {person.name}</p>;
    const next = new Set([...ancestors, person.id]);
    return <li key={person.id} className="my-3"><Link href={`/admin?selected=${person.id}`} className="inline-block rounded-xl border border-slate-200 bg-white p-4"><strong className="block">{person.name}</strong><span className="text-sm text-slate-500">{person.job_title || "Team member"}{!person.active && " · Inactive"}</span></Link><ul className="ml-3 border-l border-blue-200 pl-3 sm:ml-6 sm:pl-6">{people.filter((p) => p.manager_id === person.id).map((p) => branch(p, next))}</ul></li>;
  }
  return <div className="space-y-5"><Link href="/admin" className="text-sm text-blue-600">← People &amp; Roles</Link><h1 className="text-4xl font-bold tracking-tight">Organisation chart</h1><p className="text-slate-500">Reporting lines configured by your administrator. Select a person to edit their account.</p><ul>{people.filter((p) => !p.manager_id || !people.some((m) => m.id === p.manager_id)).map((p) => branch(p, new Set()))}</ul></div>;
}
