# Three-role application walkthrough — 6 October 2026

## Verdict

**Not ready for sign-off.** The main approval and review loops work, but data integrity, attachment validation, and responsive layouts still have reproducible failures. Successful compilation does not mean these workflows are correct.

Tested commit: `a85978a`. No application fixes were made during this audit.

## Method and scope

- Used a disposable copy of the repository and a separate SQLite database under `/private/tmp/school-work-qa.P48LJ5`. Existing workspace and production records were not used or modified.
- Entered realistic **synthetic QA records**, not real employees' personal information: Amina Yusuf QA (manager), Hassan Ali QA (staff), and Fatima Omar QA (staff). Admin provisioned their accounts and reporting lines through the UI.
- Followed two complementary objectives: audit 40 classroom devices and train 12 teachers. Entered intended outcomes, three focus areas, manager revision feedback, daily planned/recurring/reactive activity, image evidence, weekly reflections, progress percentages, and monthly ratings/comments.
- Used actual Chromium browser interactions and checked database results where needed. Tested development mode, then an optimized production build and production-server smoke tests.
- Checked 80 role/page/viewport combinations at widths **1448, 768, 390, and 320 pixels**. Tested all 14 human-facing route patterns plus protected evidence downloads. Mobile layout testing used resized Chromium viewports, not physical devices.
- Ran a separate disposable-database migration probe to distinguish startup defects from browser timing issues.
- Calibrated selectors and reran automation failures. A timeout or redirect-navigation interruption alone is not reported below as an application defect. Corrected production checks confirmed unrelated managers cannot read staff profiles/reports.

The consolidated record contains **162 assertions: 116 passed, 44 failed, and 2 policy/discoverability observations**. Failures include repeated viewport observations and multiple tests of the same bug; they are grouped into the 23 numbered issues below, not 44 independent defects.

Evidence: [validated test results](./2026-10-06-results.json), [mobile screenshots](./2026-10-06-evidence/).

## Verified working

| Area | Verified behavior |
| --- | --- |
| Login | Admin, manager, and staff email/password login; incorrect/old password rejected; logout clears access; login fits all four widths |
| Provisioning | Create manager and employee; assign manager and template; reject duplicate email; change template and refresh daily form options |
| Permissions | Staff redirected away from admin/team pages; managers denied admin pages and unrelated employee/report access; evidence downloadable by owner, direct manager, and admin, not unrelated users |
| Account state | Deactivation blocks an existing session; reactivation restores login; reset password accepts the new password and rejects the old password |
| Planning | Two monthly objectives; intended outcomes; multiple focus areas; submit; manager sees both objectives; return with feedback; staff adjusts and resubmits; manager approves |
| Daily activity | Save planned, recurring, and reactive activity; record time/status/outcome; upload a small image; show activity/evidence in weekly report |
| Weekly review | Save reflection; submit; manager requests changes; staff sees feedback and revises; manager approves |
| Monthly review | Staff submits from Objectives review panel; manager rates/comments; staff sees the feedback in that panel |
| Templates | Create template; add workstream, responsibility, review area, department; remove responsibility; duplicate template; copied workstreams preserved |
| Other | Admin name search; strategic-priority retirement/reactivation; operational recurring work item creation; changing Daily Updates status propagates to Work |
| Build | ESLint, TypeScript, and optimized production build pass; 16 production role/route smoke checks pass |

## Confirmed defects — repair order

### P1 — data integrity, access recovery, and core workflow failures

| ID | Reproduction and observed result | Likely repair location |
| --- | --- | --- |
| QA-01 | Create two monthly objectives linked to one strategy, then initialize the database again. The migration probe changes the count **2 → 3**, adding the strategic title as an unsolicited monthly objective. The same extra card appeared during the browser walkthrough. Repeated startup does not add endless copies, but the first conversion adds an unwanted objective. | `src/lib/db.ts`, legacy-to-monthly conversion in `upgrade()` |
| QA-02 | Approved focus area → Work → Add new work item → select focus → Add work. **POST /work returns 500**, and no item is created. SQL subquery orders the composite-key strategic-link table by a nonexistent `id`. | `src/lib/actions.ts:778` |
| QA-03 | Save weekly progress at 25%. Reload: input is blank. Save another reflection without re-entering progress: the existing `weekly_objective_progress` row is deleted. Confirmed in production mode. | Weekly page defaults; `saveWeeklySummary()` |
| QA-04 | Approve a weekly report, then enable the disabled form in browser developer tools and submit changed content. The server accepts the overwrite and changes status from `seen` to `submitted`. UI disabling is not an authorization/immutability check. | `saveWeeklySummary()` |
| QA-05 | After manager approval, change an underlying daily task to Pending. The approved weekly report's generated completed section changes. Activity/evidence are live queries, not an approved snapshot. | `weeklyDraft()`, weekly/report-review pages |
| QA-06 | Admin edits the sole admin account and unchecks Active. Save succeeds and leaves **zero active administrators**. Recovery requires database/server intervention. Verified only in the isolated QA database. | `updateUser()` |
| QA-07 | Upload a 2 MB PDF from Daily Update. Screen promises up to 10 MB, but the server throws **Body exceeded 1 MB limit**, status 413, and renders the application error page. | Next Server Actions body limit and upload validation |
| QA-08 | Home → Quick Update saves successfully and appears in weekly work. The same update is absent from Daily Updates and the manager's Daily Activity section. Those views still read `daily_logs` rather than all `work_updates`. Confirmed in production. | Daily history and manager report activity queries |
| QA-09 | Submit a report without optional reflection text. Staff's generated activity exists, but the manager's Key Achievements says no completed work was recorded. Manager summary/achievements use manual text rather than the generated work sections. | Manager report-review page |

### P2 — inconsistent state, misleading progress, and incomplete controls

| ID | Reproduction and observed result | Likely repair location |
| --- | --- | --- |
| QA-10 | Mark the workshop Completed through Work → Add update. Work is completed, but the original Daily Updates record still says In Progress. The reverse direction, Daily → Work, does synchronize. | `addWorkUpdate()` and `setWorkStatus()` |
| QA-11 | Complete one logged activity covering 10 of 40 devices, leaving a separate focus area for the remaining 30 untouched. The monthly objective displays **100%**. Completion is based only on logged work-item counts, not the agreed outcome or unfinished focus areas. | Monthly progress calculation and target model |
| QA-12 | Reset staff password while the staff browser remains signed in. New login correctly rejects the old password, but the existing session remains authenticated. | Session revocation/password-version check |
| QA-13 | Demote a manager to Standard while staff still report to that manager. Save is accepted, leaving a reporting line to a user who can no longer review team work. Circular manager assignments are correctly rejected. | `updateUser()` |
| QA-14 | Upload a `.txt` attachment through the file input using browser automation. The update reports success but silently discards the unsupported file. There is no validation message. | `saveEvidence()` and Daily Update error presentation |
| QA-15 | Delete a daily entry with evidence. Log/update/evidence metadata is removed, but the evidence file remains on the persistent volume. | `deleteDailyLog()` and evidence-file lifecycle |
| QA-16 | After monthly manager review, `/monthly`'s review panel shows the rating/comment, but dedicated `/reviews` shows Reviewed without the manager's comment. | Reviews query and feedback presentation |
| QA-17 | Select a Work type filter. Results do not change; there is no visible Apply button. Submitting the GET form is required but undiscoverable. | Work filter form; similar daily/admin filter presentation |
| QA-18 | Set up recurring task creates a work item labeled recurring, but no frequency, recurrence date, or schedule can be set. This is classification, not scheduled recurring work. | Work form and recurrence execution model |
| QA-19 | Open February 2026, Week 4. Weekly report shows **22–31 February**, rather than ending on 28 February. | Reporting-period calculation |

### P1/P2 — responsive and adaptive failures

**21 of 80 viewport checks detected page-level horizontal overflow.** These are repeat observations of layout defects, not 21 independent bugs. Popover and clipped-control failures below were checked separately.

| Page/state | 1448px | 768px | 390px | 320px |
| --- | --- | --- | --- | --- |
| Staff Home, populated | 1519px content | 774px content | 762px content | 762px content |
| Staff Weekly, populated | 1825px content | 1335px content | 1323px content | 1323px content |
| Staff Daily Updates | Fits | Fits | 479px content | 479px content |
| Staff Work, populated | Fits | Fits | 438px content | 438px content |
| Manager Weekly Review | Fits | Fits | 550px content | 550px content |
| Strategic Objectives | Fits | Fits | About 579–586px content | About 579–586px content |
| Template editor | Fits | Fits | 403px content | 403px content |
| Admin People | Fits | Fits | Fits closed | 364px content |

- **QA-20:** Fix overflowing cards/grids/flex rows on the pages above. Home and Weekly fail even at desktop width once realistic data is present.
- **QA-21:** Daily Update has no page-level overflow, but objective/category selects are clipped by their containing form on mobile. A scroll-width-only check misses this; screenshots confirm it.
- **QA-22:** At 390px, Invite user's form begins around **x = -189px**, placing fields outside the left edge. The closed page can look fine while the actual workflow is unusable. The separately tested Add Work popover fits at 390px.
- **QA-23:** Mobile/tablet navigation is a tall stacked list inside a sticky header, consuming much of the screen. Sign out is available only in the hidden desktop sidebar, so staff cannot sign out through the mobile UI. Login itself fits all tested widths.

## Additional implementation gaps found by inspection

These are visibly unfinished controls/features, not claimed as completed browser workflows:

- Global search, notification icon, login password-eye icon, and Forgot password label are decorative. With admin-managed accounts, password help should explicitly direct users to the administrator.
- Organisation chart tab, calendar in-card arrows/day cells, report-review tabs, and several View objective/View related tasks/View all activity labels are noninteractive spans.
- Department/status/category selectors on several admin/team screens contain placeholder-only options. People “Department” is inferred from template name rather than a separately assigned department.
- Carry Forward always displays an empty-state message rather than evaluating incomplete prior objectives.
- Work creation does not expose a due date. This prevents users from intentionally scheduling the Upcoming view; “This Week” is not actually date-bounded in `listWork()`.
- Work row progress percentages use hard-coded values by status, the workload chart is derived rather than date-based, and “Overdue” counts blocked work. These should not be presented as measured progress/deadline data.
- Monthly blocked counts read `blockers` records, whereas normal Work status changes can mark an item blocked without creating a blocker record.
- Strategic management is reachable through Team's View all link, but not a dedicated sidebar item. Team pending/approved/needs-changes views are reachable through query-state links, not standalone routes.
- Dedicated `/reviews` allows submitting a future month without an approved plan. Decide whether this is intentional for operational-only reviews or should be gated; this was tested but is not assumed to violate a settled business rule.
- Google authentication remains disabled intentionally and is excluded from failures.

## Recommended next pass

1. Repair QA-01 through QA-09 before another acceptance run: migration compatibility, linked-work SQL, saved progress, approved snapshots/server locks, admin lockout protection, upload limits, and unified reporting data.
2. Unify Home/Work/Daily activity views and status handling; define measurable objective progress; add session revocation and manager-role transition safeguards.
3. Repair populated-data responsiveness and mobile navigation/dialogs, then wire or remove unfinished controls.
4. Repeat the same role journey on a production build, then verify the actual Coolify deployment and persistent `/app/data` volume.

## Limits

This audit did not access the live production database, change deployed accounts, test the actual Coolify volume, simulate multiple simultaneous editors, run Safari/Firefox, test physical touch devices, or perform a formal accessibility/security penetration audit. The local restart/migration and production-build tests are not proof of production volume configuration. Test copies contain disposable credentials and were kept outside the repository; no passwords are included in these deliverables.
