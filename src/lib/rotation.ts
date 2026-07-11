// The rotation: task categories carry a day code (A/B/C) and a week number (1-4).
// Day codes cycle across the working week: Mon=A, Tue=B, Wed=C, Thu=A, Fri=B.
// Week number is the week of the month, capped at 4 so months with a 5th week
// repeat week 4 rather than falling off the rotation.

export function dayCodeFor(date: Date): string | null {
  const weekday = date.getDay(); // 0=Sun .. 6=Sat
  if (weekday === 0 || weekday === 6) return null;
  return ["A", "B", "C", "A", "B"][weekday - 1];
}

export function weekOfMonth(date: Date): number {
  return Math.min(Math.ceil(date.getDate() / 7), 4);
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
