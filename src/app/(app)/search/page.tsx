import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireSessionUser();
  const { q = "" } = await searchParams;
  const pattern = `%${q.slice(0, 200)}%`;
  const db = getDb();
  const work = q.trim() ? db.prepare("SELECT id,title FROM work_items WHERE user_id = ? AND (title LIKE ? OR description LIKE ?) ORDER BY updated_at DESC LIMIT 30").all(user.id, pattern, pattern) as { id: number; title: string }[] : [];
  const objectives = q.trim() ? db.prepare("SELECT mo.id,mo.title,mp.year,mp.month FROM monthly_objectives mo JOIN monthly_plans mp ON mp.id=mo.plan_id WHERE mp.user_id=? AND mo.archived=0 AND mo.title LIKE ? LIMIT 30").all(user.id, pattern) as { id: number; title: string; year: number; month: number }[] : [];
  const people = q.trim() && user.role !== "employee" ? db.prepare("SELECT id,name FROM users WHERE (manager_id=? OR ?='admin') AND (name LIKE ? OR job_title LIKE ?) LIMIT 30").all(user.id, user.role, pattern, pattern) as { id: number; name: string }[] : [];
  return <div className="space-y-5"><h1 className="text-4xl font-bold">Search</h1><form className="flex gap-2"><input name="q" defaultValue={q} aria-label="Search" className="min-w-0 flex-1 rounded-lg border border-slate-200 p-3" /><button className="rounded-lg bg-blue-600 px-4 text-white">Search</button></form>{!q.trim() ? <p>Search your work, objectives, or team.</p> : <><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Work</h2>{work.map((item) => <Link key={item.id} href={`/work?view=completed&q=${encodeURIComponent(item.title)}`} className="mt-3 block text-blue-600">{item.title}</Link>)}{!work.length && <p>No matching work.</p>}</section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Objectives</h2>{objectives.map((item) => <Link key={item.id} href={`/monthly?year=${item.year}&month=${item.month}#objective-${item.id}`} className="mt-3 block text-blue-600">{item.title}</Link>)}{!objectives.length && <p>No matching objectives.</p>}</section>{user.role !== "employee" && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">People</h2>{people.map((item) => <Link key={item.id} href={user.role === "admin" ? `/admin?selected=${item.id}` : `/team/${item.id}`} className="mt-3 block text-blue-600">{item.name}</Link>)}{!people.length && <p>No matching people.</p>}</section>}</>}</div>;
}
