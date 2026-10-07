"use client";
import { Icon as NavIconGlyph } from "@/components/icon";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavIcon = "home" | "work" | "objectives" | "reports" | "team" | "admin" | "daily" | "reviews";
export type NavItem = { href: string; label: string; icon: NavIcon; exact?: boolean };



export function AppShellNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex max-w-full gap-1 overflow-x-auto lg:block lg:space-y-1" aria-label="Main navigation">
      {items.map((item) => {
        const active = item.exact || item.href === "/" ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <span aria-hidden="true" className={`${active ? "text-blue-600" : "text-slate-500"}`}><NavIconGlyph name={item.icon} className="h-5 w-5" /></span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
