"use client";

export function PopoverClose() {
  return <button type="button" aria-label="Close form" className="justify-self-end rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600" onClick={(event) => {
    const details = event.currentTarget.closest("details");
    details?.removeAttribute("open");
    (details?.querySelector("summary") as HTMLElement | null)?.focus();
  }}>Close</button>;
}
