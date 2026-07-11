import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { saveMonthlyReview } from "@/lib/actions";
import { MONTH_NAMES } from "@/lib/rotation";
import { Card, Field, PageHeader, Badge, SavedNotice, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

type TorArea = { id: number; name: string };
type Review = {
  id: number;
  strategic_objectives: string;
  key_achievements: string;
  outputs_delivered: string;
  impact_summary: string;
  recommendations: string;
  pending_items: string;
  self_rating: number | null;
  status: "draft" | "submitted" | "reviewed";
  manager_rating: number | null;
  manager_comments: string;
};

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; year?: string; month?: string }>;
}) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const db = getDb();
  const now = new Date();

  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const torAreas = user.template_id
    ? (db.prepare("SELECT id, name FROM tor_areas WHERE template_id = ? ORDER BY sort").all(user.template_id) as TorArea[])
    : [];

  const review = db
    .prepare("SELECT * FROM monthly_reviews WHERE user_id = ? AND year = ? AND month = ?")
    .get(user.id, year, month) as Review | undefined;

  const commentaries = new Map<number, string>();
  if (review) {
    const rows = db
      .prepare("SELECT tor_area_id, commentary FROM monthly_commentaries WHERE review_id = ?")
      .all(review.id) as { tor_area_id: number; commentary: string }[];
    rows.forEach((r) => commentaries.set(r.tor_area_id, r.commentary));
  }

  const locked = review?.status === "reviewed";
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My month"
        subtitle="At the end of the month, write a short commentary against each of your TOR areas and rate yourself. When you submit, your line manager is asked to review it."
      />
      <SavedNotice show={params.saved === "1"} text="Your monthly review has been saved." />

      <Card>
        <div className="flex items-center justify-between">
          <Link href={`/monthly?year=${prev.y}&month=${prev.m}`} className={btnSecondary}>← {MONTH_NAMES[prev.m - 1]}</Link>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">{MONTH_NAMES[month - 1]} {year}</p>
            {review && (
              <Badge tone={review.status === "reviewed" ? "green" : review.status === "submitted" ? "blue" : "slate"}>
                {review.status === "reviewed" ? "Reviewed by your manager" : review.status === "submitted" ? "Submitted — waiting for review" : "Draft"}
              </Badge>
            )}
          </div>
          <Link href={`/monthly?year=${next.y}&month=${next.m}`} className={btnSecondary}>{MONTH_NAMES[next.m - 1]} →</Link>
        </div>
      </Card>

      {locked && review && (
        <Card title="Your manager's feedback">
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              <span className="font-medium">Manager rating:</span> {review.manager_rating ?? "—"} / 5
            </p>
            {review.manager_comments && <p className="text-sm text-slate-700 whitespace-pre-wrap">{review.manager_comments}</p>}
          </div>
        </Card>
      )}

      <Card title={locked ? "Your submission (locked after review)" : "Monthly review"}>
        <form action={saveMonthlyReview} className="space-y-4">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
            <Field label="Strategic objectives this month">
              <textarea name="strategic_objectives" rows={2} defaultValue={review?.strategic_objectives} className={inputCls} />
            </Field>
            <Field label="Key achievements">
              <textarea name="key_achievements" rows={3} defaultValue={review?.key_achievements} className={inputCls} />
            </Field>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Commentary by TOR area</p>
              <div className="space-y-3">
                {torAreas.map((t) => (
                  <Field key={t.id} label={t.name}>
                    <textarea name={`tor_${t.id}`} rows={2} defaultValue={commentaries.get(t.id) ?? ""} className={inputCls} />
                  </Field>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Outputs delivered">
                <textarea name="outputs_delivered" rows={2} defaultValue={review?.outputs_delivered} className={inputCls} />
              </Field>
              <Field label="Impact on school performance">
                <textarea name="impact_summary" rows={2} defaultValue={review?.impact_summary} className={inputCls} />
              </Field>
              <Field label="Recommendations to SMT">
                <textarea name="recommendations" rows={2} defaultValue={review?.recommendations} className={inputCls} />
              </Field>
              <Field label="Pending items">
                <textarea name="pending_items" rows={2} defaultValue={review?.pending_items} className={inputCls} />
              </Field>
            </div>

            <Field label="Self-rating for the month" hint="1 = well below expectations, 5 = outstanding">
              <select name="self_rating" defaultValue={review?.self_rating ?? ""} className={`${inputCls} max-w-40`}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>

            {!locked && (
              <div className="flex flex-wrap gap-3 pt-2">
                <button type="submit" name="intent" value="draft" className={btnSecondary}>
                  Save as draft
                </button>
                <button type="submit" name="intent" value="submit" className={btnPrimary}>
                  Submit to my line manager
                </button>
              </div>
            )}
          </fieldset>
        </form>
      </Card>
    </div>
  );
}
