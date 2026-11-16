# Work Journal

A phone-friendly work journal for monthly objectives, focus areas, daily activities, approval, and Saturday–Friday reporting. The current local version adds invitation-only email/password login and a separate system administrator.

## Local login

Open `http://127.0.0.1:5190/login` after starting the dev server. There is no public signup page, and the signup API is explicitly rejected.

- System administrator: `smithinitianix@gmail.com`. This is a separate account with no work journal, line manager, or direct reports. It starts awaiting setup; no default administrator password is assigned. The one-time local setup link is stored in the ignored, private `outputs/admin-setup-link.txt` file.
- Ian’s staff account: `ict@hia.edu.so`. Its existing local journal and reporting relationships keep the same internal user ID.
- Fictional local staff and a QA administrator are available for development. Their credentials are in the ignored `outputs/local-demo-accounts.txt` file. They are never seeded by a migration or deployed.

The auth session is independent of ChatGPT authentication. Old local persona cookies and authenticated platform headers grant no application access. The unauthenticated persona-switch route has been removed.

## Account roles

**System administrators** land in `/admin`. They can create employees, line managers, and separate administrators; edit names, departments, and reporting assignments; enable/disable accounts; issue setup/reset links; and inspect account-management audit events. They cannot open personal record APIs, log work, review plans, receive reports, or be assigned a line manager. Staff accounts cannot be converted into administrator accounts; create a separate identity instead. An active administrator cannot disable/reset their own access, and the last active administrator is protected.

**Line managers** retain their personal journal and can report to their own manager. In My team → People, they can create employee accounts assigned directly to themselves, issue setup/reset links, and enable/disable those direct-report accounts. Only a system administrator can grant manager/admin capabilities or edit reporting assignments.

**Employees** can use their journal, submit objectives and weekly reports, and see their own manager. They cannot create accounts or open account-management APIs.

New account holders choose their own password using a one-time setup link. The creator shares it through their chosen channel; the app does not send email. Links expire after 24 hours, are stored only as hashes in the database, and are consumed atomically. Issuing a reset link invalidates older links and ends existing sessions. Disabling an account also ends its sessions. Password recovery is handled by the line manager or administrator through a new setup link.

## Work and reporting

Monthly objectives have focus-area targets, units, and relative importance weights. Unit offers suggestions plus a custom option. Progress is based on explicit new contributions toward targets, not activity counts. General operational work can remain unlinked. Planned and blocked entries contribute zero. Focus-area progress caps at 100%, objective progress uses focus weights, and the monthly overview averages objectives equally.

New objectives follow Draft → Submitted → Approved, Changes requested, or Rejected. The complete objective and its targets are locked during review. Changes/rejection require feedback. Linked work is blocked before approval. Revising an approved plan pauses new linked work until reapproval. Existing plans from before this workflow retain their historical activity and enter approval when revised.

Weekly reports contain updates, challenges, recommended solutions, and next week’s plan. Submission saves a snapshot; later journal edits do not rewrite it. A manager sees only direct reports, with one compact row per person, unread/reviewed status, highlights, challenges, and missing-submission filters. On phones, one report opens at a time. The current roster is used when viewing older weeks.

## Architecture and security

React / Vinext, Cloudflare Worker, D1, Drizzle, and Better Auth. Password hashes and sessions are handled by Better Auth; account admission, role checks, provisioning, and setup links are enforced server-side. Public auth routes are limited to login, logout, and session retrieval; public signup is disabled both in configuration and at the route boundary.

Session cookies use HttpOnly and SameSite handling, with secure cookies for HTTPS. Sessions expire after eight hours, and access is rechecked on each protected request. Passwords must be 12–128 characters. Login and setup attempts are throttled with persistent database counters. Writes check request origin. Record revisions protect conflicting edits, plan submission and target edits share an atomic guard, reporting loops are rejected, and account changes are audited without passwords or setup tokens.

Auth schema is in `db/auth-schema.ts`, application authorization in `lib/auth.ts` and `lib/server.ts`, account operations in `/api/accounts`, and setup in `/api/setup`. System administrator data is separate from `journal_people`, which holds only staff reporting profiles.

## Development

The checkout is local. Runtime configuration belongs in ignored `.dev.vars`:

- `APP_ORIGIN=http://127.0.0.1:5190`
- `BETTER_AUTH_SECRET` with at least 32 random characters.

No default production secret or password is included. Use the installed Sites build helper for the Worker. Apply pending SQL migrations in order to local D1, using Wrangler with explicit `--local` and `.wrangler/state` persistence. Applied migrations are immutable. `0002_striped_cyclops.sql` adds auth/account tables and contains no user seeds.

After the auth migration is applied, `node scripts/seed-local-auth.mjs` prepares local configuration and seeds local accounts only. It does not deploy or access the hosted database. Re-running preserves existing passwords. Do not run seeds as a routine server-start step.

Start with `npm run dev -- --port 5190`. Use the configured 127.0.0.1 origin for cookies and origin checks.

Checks:

```sh
npx tsc --noEmit
node --experimental-strip-types tests/journal.test.mjs
node tests/auth.test.mjs
node tests/setup-links.test.mjs
node tests/api.test.mjs
node tests/workflow.test.mjs
node tests/workflow-edge.test.mjs
```

HTTP tests require the local server and QA seed. They use real password sessions, create temporary accounts through the administrator API, and remove only their temporary records via explicitly local D1 cleanup. Existing local journals are preserved. Repeated full-suite runs can correctly hit the authentication throttles; test-counter resets must be explicitly local and limited to QA identities.

## Hosted transition

The live Site remains on the previous version and its existing access policy. This login change has not been deployed. Moving it live requires configuring runtime secrets and the intended host for app-specific authentication, migrating Ian’s existing staff ID to `ict@hia.edu.so` without moving or deleting journal records, and bootstrapping `smithinitianix@gmail.com` separately. The existing Sites outer ChatGPT access gate is distinct from this application login and must be addressed as part of that hosting transition; it has not been silently made public.

No live data, coworkers, emails, or access grants were changed by this local implementation.

## Report feedback and monthly reflection

Line managers can send feedback from an opened report in My team → Report inbox. Feedback is append-only, dated, and tied to the submitted version; sending it marks that version reviewed. Employees see it in the corresponding weekly/monthly report, including feedback on older versions, and recent feedback appears on Overview. Managers can read/comment only on reports delivered to them by current direct reports; administrators have no review access.

Reports now has Weekly report and Monthly summary tabs. A monthly summary derives each objective’s achievement from logged contributions and lists actual challenges recorded that month. The employee adds explanations, per-objective limiting factors, wider factors, a reflection, and proposals for next month. Unachieved objectives require an explanation before submission, and a personal next-month proposal is required. Drafts can be saved incomplete. Coverage-based suggestions are factual planning prompts, not generated claims about why something failed or automatically created objectives.

A monthly submission saves a separate snapshot with the period type `monthly`. Managers switch their report inbox between weekly and monthly views. Later edits do not rewrite submitted text, progress figures, or previous feedback. Submitting an update creates a new unread version. Monthly drafts use revision checks and an atomic one-draft-per-owner/month guard.

## Academic-year coverage

The card at the bottom of Objectives uses September–August. It shows the proportion of strategic areas with completed or in-progress linked work, distinct months worked, approved/existing months planned, and average monthly target progress. Many activities in one area count as one area covered, and many activities in one month count as one month worked. Target progress is averaged within each month and then across planned months. Future-dated work is excluded from current coverage, and blocked attempts appear as challenges rather than work credited.

The initial strategic-area list is the ten ICT areas from the supplied action plan. Staff can add stable custom areas, applicable from the selected academic year onward. Monthly objectives link to a strategic area even when the monthly title changes. Exact normalized matches to original area names are recognised for older objectives. Other unlinked historical plans are flagged, retained, and excluded from the percentage until the employee revises and classifies them; the app does not guess their meaning. Areas are retained so deleting an untouched area cannot improve the percentage. An untouched area is a prompt for discussion; priorities may be seasonal.

Submitting an objective attaches an immutable coverage snapshot to its approval request: the selected area’s prior months of work, the balance across areas, and areas not yet worked. This gives the line manager context for requesting a different focus. Existing submissions made before this feature are preserved without inventing retrospective coverage evidence.

Migration `0003_hot_khan.sql` adds the feedback table and a constant `weekly` period-type default to existing submissions. It does not alter work records, objective targets, passwords, or previous report content.

Additional validation:

```sh
node tests/run-domain.mjs tests/coverage.test.mjs
node tests/reporting.test.mjs
```

The reporting integration suite uses temporary local accounts and tests feedback privacy, version history, a three-month-versus-zero approval context, monthly explanations/factors/proposals, concurrent draft creation, and immutable snapshots. Local fixture cleanup removes feedback before its referenced report versions.

## Local coordinator seed

`seed-data/coordinators-2026-27.json` records the source-derived PYP, MYP and DP annual intentions, evidence and November planning windows. Run `node scripts/seed-coordinators.mjs` after building and applying local migrations. The script targets local D1 only and links Clare Pearl, Earnest Ondara and Paul Kioko to the existing principal. It creates role-specific catalogues of 3, 9 and 6 strategic areas and November drafts of 3, 9 and 5 objectives respectively. The DP subject-selection area remains in the annual catalogue without a November repeat because its source places the work in October.

All imported plans require review and approval; no completed work or achievement is inferred. Deliverable targets and equal weights are initial drafts. Coordinator catalogues omit the ICT defaults, while existing ICT users retain them. Annual intentions and source evidence remain visible during planning and approval.

The seed preserves existing passwords, records and edits on rerun. New users receive no default password. One-time, 24-hour local setup instructions and an import report are saved in the ignored, private `outputs/coordinator-seeding/` directory; no invitation email is sent. Use Administration to issue a fresh setup link when needed.

```sh
node tests/run-domain.mjs tests/coordinator-catalogues.test.mjs
```

## Coolify / VPS deployment

The Dockerfile builds a Next.js standalone server on Node 24. A SQLite adapter retains the existing D1 query interface and executes batches atomically. `APP_ORIGIN` must be the HTTPS deployment origin. Mount the existing persistent volume at `/app/data`; the new journal uses `work-journal.sqlite`, leaving the former `school.db` untouched. A session-signing secret is generated once in that volume unless `BETTER_AUTH_SECRET` is explicitly supplied.

Startup applies versioned migrations and seeds the coordinator catalogue once. There are no default passwords, QA accounts, sessions or completed work in production. The separate administrator, Ian and the three coordinators receive single-use setup links saved privately to `/app/data/work-journal-setup-links.json` (24 hours). The placeholder principal remains disabled until configured by the administrator. Local demo accounts and local passwords are not deployed. Existing local journal data is kept locally; the initial VPS installation imports the coordinator plans from the checked-in manifest.

The GitHub `work-journal` branch replaces the old application deployment while the previous `main` branch and database remain available for rollback. Before switching, create a SQLite backup of the former database. Preserve the volume and set `APP_ORIGIN=https://hilal.hia.edu.so` in Coolify. Rebuilding or restarting does not reseed or reset users and records.

```sh
node tests/sqlite-d1.test.mjs
npm run build:vps
```
