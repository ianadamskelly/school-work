# Repair verification — 7 October 2026

All 24 identified repairs are implemented and checked individually in the [repair tracker](repair-tracker.md). The [original walkthrough](2026-10-06-walkthrough.md) and its results remain unchanged as the baseline.

## Final results

- 18/18 backend regression checks passed using real actions, authentication, SQLite transactions and filesystem evidence. Only Next.js request-context adapters were mocked for this suite.
- 91/91 browser checks passed against an isolated production build with disposable administrator, line-manager and staff accounts.
- This includes 76 populated-layout checks at 320, 390, 768 and 1448 px, checking page overflow, plus focused checks for daily controls, mobile employee creation, navigation and sign-out.
- TypeScript, ESLint and the application's real standalone production build passed.
- A full 10 MB PDF upload succeeded over HTTP and downloaded intact. Invalid/oversized evidence was rejected without creating partial updates.

Machine-readable results: [all assertions](2026-10-07-repair-results.json). Reusable harnesses: `scripts/regression.cjs` and `scripts/ui-regression.cjs`.

## Verified end-to-end journeys

- Staff added a complementary monthly objective and focus area, submitted November's plan, received manager feedback, revised and resubmitted it, and saw its approved status. Manager routes and redirects retained the selected month.
- Staff saved and submitted a weekly report; the manager requested changes; staff revised and resubmitted; the manager approved it. Submitted/approved content remains locked with frozen activity and evidence.
- Administrator created an employee through the mobile invitation form. Backend checks covered last-admin protection, reporting-line safeguards, password reset and old-session revocation.
- Daily and work updates share history and synchronize status. Manager reports show generated achievements; staff can see monthly manager feedback.
- Evidence downloads worked for the owner, direct manager and administrator and were denied to signed-out visitors. Staff were denied access to administrator and manager screens.
- Carry-forward copied agreed objectives/focus progress into an approval-required draft without duplicates; recurring schedules generated independent occurrences idempotently; template edits persisted.

## Evidence screenshots

- [Mobile employee invitation](2026-10-07-repair-evidence/admin-invite-mobile.png)
- [Mobile daily update](2026-10-07-repair-evidence/daily-mobile.png)
- [Mobile objectives with approval status](2026-10-07-repair-evidence/objectives-mobile.png)
- [Desktop manager report](2026-10-07-repair-evidence/manager-report-desktop.png)

## Important behavior and verification limits

- Objective percentages represent explicitly recorded agreed focus-area progress, not a misleading ratio of completed tasks. Daily activity feeds report evidence; staff still assess actual outcome progress.
- Recurring occurrences are materialized when work is accessed within a bounded date horizon, not by an unattended background scheduler.
- Previously submitted legacy reports without snapshots freeze the content available on first read. Their original submission-time content cannot be reconstructed retrospectively.
- Google authentication remains deferred; administrator-provisioned email/password login remains the supported flow.
- Tests used local disposable data and Chromium. Live Coolify deployment, persistent-volume behavior, Safari/Firefox and physical-device testing were not verified in this repair run.
- These repairs have not been committed, pushed or deployed in this turn. Back up the production database before deployment and retain the persistent `/app/data` volume and production `SESSION_SECRET`.
