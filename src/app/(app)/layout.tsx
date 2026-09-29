import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { AppShellNav, type NavItem } from "@/components/app-shell-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const links: NavItem[] = [{ href: "/", label: "Home", icon: "⌂" }, { href: "/work", label: "Work", icon: "✓" }];
  if (user.template_id) {
    links.push({ href: "/monthly", label: "Objectives", icon: "◎" }, { href: "/weekly", label: "Reports", icon: "▤" });
  }
  if (user.role === "manager" || user.role === "admin") {
    links.push({ href: "/team", label: "My team", icon: "♧" });
  }
  if (user.role === "admin") {
    links.push({ href: "/admin", label: "Admin", icon: "⚙" });
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-slate-200 bg-white px-4 py-6 lg:flex lg:flex-col">
        <Link href="/" className="mb-9 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm">P</span>
          <span className="text-xl font-bold tracking-tight text-slate-900">Progress</span>
        </Link>
        <AppShellNav items={links} />
        <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">SIGNED IN AS</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.job_title || user.role}</p>
          <form action={logout} className="mt-3"><button type="submit" className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer">Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-[73px] items-center justify-between gap-4 px-4 sm:px-7">
            <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 lg:hidden"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">P</span>Progress</Link>
            <div className="hidden max-w-sm flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-400 md:block">⌕ Search work, people, objectives…</div>
            <div className="ml-auto flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-sm font-semibold text-slate-800">{user.name}</span><span className="block text-xs text-slate-500">{user.job_title || user.role}</span></span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-700 text-sm font-semibold text-white">{user.name.charAt(0)}</span></div>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 lg:hidden"><AppShellNav items={links} /></div>
        </header>
        <main className="mx-auto w-full max-w-[1340px] px-4 py-6 sm:px-7 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
