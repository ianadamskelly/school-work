# Repair tracker

Each item is marked complete only after implementation and verification. The original audit remains unchanged as the baseline.

- [x] QA-01 Safe monthly-objective migration and recovery of unused generated duplicates — restart and archival regression tests passed
- [x] QA-02 Objective-linked work creation — real action/SQL regression passed
- [x] QA-03 Saved weekly progress reload and preservation
- [x] QA-04 Server-side locks for submitted/approved reports
- [x] QA-05 Stable report activity and evidence snapshots
- [x] QA-06 Last-administrator protection
- [x] QA-07 Attachment request limit aligned with 10 MB uploads
- [x] QA-08 Unified daily history and manager activity
- [x] QA-09 Generated manager achievements
- [x] QA-10 Bidirectional status synchronization
- [x] QA-11 Explicit focus-area progress and honest objective percentages
- [x] QA-12 Password-reset session revocation
- [x] QA-13 Safe manager role/state transitions
- [x] QA-14 Visible attachment validation without partial saves
- [x] QA-15 Evidence-file cleanup and historical-report protection
- [x] QA-16 Monthly review manager feedback
- [x] QA-17 Discoverable filter submission
- [x] QA-18 Recurring-work schedule and occurrences
- [x] QA-19 Correct reporting period ends
- [x] QA-20 Responsive populated layouts
- [x] QA-21 Unclipped daily form controls
- [x] QA-22 Mobile invitation form
- [x] QA-23 Compact mobile navigation and sign-out

Additional inspected gaps: wire useful controls, remove misleading placeholders, surface management routes, carry-forward objectives, real due dates/workload metrics, and consistent blocker counts. Google authentication remains deferred.

Verified data-layer repairs: `scripts/regression.cjs` executes real authentication, actions, transactions, filesystem evidence, and SQL against a disposable database. All 18 checks pass.

- [x] QA-24 Preserve the selected month in manager/team routes and approval-feedback redirects, and display the resulting plan status to staff — complete multi-month feedback/resubmission/approval browser journey passed.

Final acceptance: all 24 identified repairs are complete. All 18 backend checks and 91 browser checks pass, including 76 populated-layout checks across 320, 390, 768 and 1448 px widths. TypeScript, lint and the real standalone production build also pass. See [repair verification](2026-10-07-repair-verification.md) for evidence and remaining verification limits. The original audit remains unchanged.
