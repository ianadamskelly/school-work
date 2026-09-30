"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavIcon = "home" | "work" | "objectives" | "reports" | "team" | "admin";
export type NavItem = { href: string; label: string; icon: NavIcon };

function NavIconGlyph({ name }: { name: NavIcon }) {
  const shapes: Record<NavIcon, ReactNode> = {
    home: <><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 20v-6h6v6" /></>,
    work: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4m-8 6 2.5 2.5L16.5 10" /></>,
    objectives: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m12 12 7-7" /></>,
    reports: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 17v-4M12 17V8M16 17v-7" /></>,
    team: <><circle cx="9" cy="9" r="3" /><circle cx="16" cy="10" r="2.5" /><path d="M3.5 20c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5M14 15c3 0 5 1.7 5.5 5" /></>,
    admin: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2.1-.7a5.4 5.4 0 0 0-.7-1.6l1-2-2.1-2.1-2 1a5.4 5.4 0 0 0-1.6-.7L10.5 2h-3l-.7 2.1a5.4 5.4 0 0 0-1.6.7l-2-1-2.1 2.1 1 2a5.4 5.4 0 0 0-.7 1.6L.5 10.5v3l2.1.7a5.4 5.4 0 0 0 .7 1.6l-1 2L4.4 20l2-1a5.4 5.4 0 0 0 1.6.7l.7 2.1h3l.7-2.1a5.4 5.4 0 0 0 1.6-.7l2 1 2.1-2.1-1-2a5.4 5.4 0 0 0 .7-1.6z" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{shapes[name]}</svg>;
}

export function AppShellNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <span aria-hidden="true" className={`${active ? "text-blue-600" : "text-slate-500"}`}><NavIconGlyph name={item.icon} /></span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
