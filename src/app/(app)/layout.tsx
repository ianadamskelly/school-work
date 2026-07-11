import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logout } from "@/lib/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const links: { href: string; label: string }[] = [{ href: "/", label: "Home" }];
  if (user.template_id) {
    links.push({ href: "/daily", label: "My day" }, { href: "/weekly", label: "My week" }, { href: "/monthly", label: "My month" });
  }
  if (user.role === "manager" || user.role === "admin") {
    links.push({ href: "/team", label: "My team" });
  }
  if (user.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-navy-800 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm">SW</span>
            <span className="hidden sm:inline">School Work Tracker</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 hover:bg-white/10 whitespace-nowrap">
                {l.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="flex items-center gap-3">
            <span className="hidden text-xs text-white/70 md:inline">{user.name}</span>
            <button type="submit" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 cursor-pointer">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        School Work Tracker
      </footer>
    </div>
  );
}
