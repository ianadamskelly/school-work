"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";

export function PasswordInput() {
  const [visible, setVisible] = useState(false);
  return <span className="relative block"><input name="password" type={visible ? "text" : "password"} autoComplete="current-password" required className="h-[54px] w-full rounded-xl border border-slate-200 px-4 pr-14 text-base outline-none focus:border-blue-500" placeholder="Enter your password" /><button type="button" aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500"><Icon name={visible ? "eye-off" : "eye"} className="h-5 w-5" /></button></span>;
}
