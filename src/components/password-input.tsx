"use client";
import { useState } from "react";

export function PasswordInput() {
  const [visible, setVisible] = useState(false);
  return <span className="relative block"><input name="password" type={visible ? "text" : "password"} autoComplete="current-password" required className="h-[54px] w-full rounded-xl border border-slate-200 px-4 pr-20 text-base outline-none focus:border-blue-500" placeholder="Enter your password" /><button type="button" aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)} className="absolute right-3 top-4 text-sm text-blue-600">{visible ? "Hide" : "Show"}</button></span>;
}
