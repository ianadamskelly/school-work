"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

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
            <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-lg text-sm ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
