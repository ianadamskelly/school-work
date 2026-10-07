import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { AppShellNav, type NavItem } from "@/components/app-shell-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const links: NavItem[] = [{ href: "/", label: "Home", icon: "home" }, { href: "/work", label: "Work", icon: "work" }];
  {
    links.push(
      { href: "/daily/updates", label: "Daily Updates", icon: "daily" },
      { href: "/monthly", label: "Objectives", icon: "objectives" },
      { href: "/weekly", label: "Reports", icon: "reports" },
      { href: "/reviews", label: "Reviews", icon: "reviews" }
    );
  }
  if (user.role === "manager" || user.role === "admin") {
    links.push({ href: "/team", label: "Team", icon: "team", exact: true }, { href: "/team/objectives", label: "Strategic Objectives", icon: "objectives" }, { href: "/team?tab=objectives", label: "Team Approvals", icon: "team" });
  }
  if (user.role === "admin") {
    links.push({ href: "/admin", label: "People & Roles", icon: "admin", exact: true }, { href: "/admin/templates", label: "Role Templates", icon: "admin" }, { href: "/admin/organisation", label: "Organisation", icon: "team" });
  }

  return (
    <div className="min-h-screen bg-[#fcfdff] lg:grid lg:grid-cols-[238px_minmax(0,1fr)]">
      <aside className="hidden border-r border-slate-200 bg-white px-4 py-6 lg:flex lg:flex-col">
        <Link href="/" className="mb-9 flex items-center gap-3 px-2">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm before:absolute before:left-0 before:top-0 before:h-4 before:w-4 before:rounded-tl-xl before:bg-cyan-300">P</span>
          <span className="text-[25px] font-bold tracking-[-0.04em] text-slate-950">Progress</span>
        </Link>
        <AppShellNav items={links} />
        <div className="mt-auto border-t border-slate-100 px-2 pt-5">
          <p className="text-sm font-medium text-slate-500">Your school workspace</p>
          <p className="mt-1 text-xs text-slate-400">Keep objectives, work and reports connected.</p>
          <form action={logout} className="mt-4"><button type="submit" className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer">Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-[73px] items-center justify-between gap-4 px-4 sm:px-7">
            <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 lg:hidden"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">P</span>Progress</Link>
            <form action="/search" className="hidden max-w-[378px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm md:flex"><input name="q" aria-label="Search tasks, people, objectives" placeholder="Search tasks, people, objectives…" className="min-w-0 flex-1 bg-transparent outline-none" /><button className="text-blue-600">Search</button></form>
            <div className="ml-auto flex items-center gap-4"><span className="hidden text-sm font-medium text-slate-600 xl:block">▣&nbsp; {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span><span className="hidden h-7 w-px bg-slate-200 sm:block" /><Link href={user.role === "employee" ? "/weekly" : "/team"} className="hidden text-xs text-blue-600 sm:block">Updates</Link><span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{user.name.charAt(0)}</span><span className="hidden text-left sm:block"><span className="block text-sm font-semibold text-slate-900">{user.name}</span><span className="block text-xs text-slate-500">{user.job_title || user.role}</span></span></div>
          </div>
          <div className="flex min-w-0 items-center gap-2 border-t border-slate-100 px-4 py-2 lg:hidden"><div className="min-w-0 flex-1"><AppShellNav items={links} /></div><form action={logout}><button className="whitespace-nowrap rounded-lg border border-slate-200 px-2 py-2 text-xs">Sign out</button></form></div>
        </header>
        <main className="mx-auto w-full max-w-[1190px] px-4 py-6 sm:px-7 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
