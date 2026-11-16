# Dashboard design pass

## Questions and actions

- Staff overview: what needs my attention, and how is this month progressing? Numbers: monthly objective progress, completed / recorded activities, logged hours, plans awaiting approval. Draft/revision plans link to Objectives; blocked work opens its editor; weekly check-in opens the report. Empty accounts get an objective setup action, never an all-clear.
- Manager inbox: whose report needs review? Received, unread, missing and people with challenges each filter the direct-report list. Approval count remains on its tab.
- System administrator: who has access and who needs setup? All, active, invited and disabled counts filter the account list. No journal or manager permissions change.

## Fixed local fixture and known totals

Use only throwaway accounts labelled QA dashboard. Never seed or edit live records for visual tests.

November 2026 has four objectives: approved, draft, changes requested, submitted. Approved objective has targets (4, weight 3) and (2, weight 1), with contributions 2 and 2: 62.5%. Three other objectives have zero progress: monthly mean 15.625%, rendered 16%. One plan awaits approval. Three attention items: draft, revision, blocked activity.

Four activities dated 16 November: done (60 minutes), done (30), blocked (15), planned (0). Completed / recorded = 2 / 4; logged time = 105 minutes = 1.8 hours. Completed work mix: planned 1, recurring 1, unplanned 0. No previous-period delta or invented targets.

Manager fixture: two direct reports; one submitted report, unread, one person with challenges, one missing. Filters must show 1 / 1 / 1 / 1 accordingly. Empty account: no objectives means an em dash, no percentage bar, zero recorded activities, setup action visible.

## Form and style choices

Progress uses a 0–100 linear bar; counts use tabular figures; plan and report state use labelled badges. No decorative chart. Keep Work Journal's green identity and its current light theme. Do not add a theme feature as part of this pass. Preserve essential explanations on forms, approval evidence and reports; overview explanations move to accessible help controls. Retain the five-item phone bottom navigation: it already fits without horizontal scrolling and provides direct access to daily logging.

## Verification

Before commit: build and TypeScript; independent fixture numbers vs rendered labels; account menu has one sign-out action per shell; month controls cross year boundaries; manager metric filters work; no new approval or data-access rules. Inspect screenshots at 3440, 1440 and 375 px. Verify phone horizontal scroll width equals viewport; keyboard Escape/outside dismissal on popovers; long names wrap; empty and populated states; signed-in administrator and manager views. Test loading/error without inventing successful refresh times. Record actual results in ignored outputs.

## Completed checks (16 November 2026)

The isolated fixture matched rendered metrics: 16%, 2 / 4, 1.8 hrs, one awaiting approval, and three attention items. All four manager report filters returned one person each. Admin filters returned 10 / 5 / 4 / 1 accounts. One sign-out action was present in each account menu; Escape dismissed the menu. January/December month navigation and the no-target em dash passed. A blocked-work shortcut opened the correct existing activity without saving it. Section navigation returned to scroll position zero.

Screenshots were reviewed at 375, 1440 and 3440 CSS pixels, including the manager and administrator phone layouts. Phone document width was exactly 375 px. Mobile activity actions were moved below content after screenshot review caught overlapping badges. The attention panel comes first on phones. The wide layout uses two objective columns and a wider canvas.

The optional loopback-only `tests/dashboard-qa-proxy.mjs` injects failures on the first and third records requests. Initial failure showed a retry state with no fabricated metric values; retry restored 16%. A later failed refresh retained 16% and the previous successful-update timestamp. Fixture credentials, screenshots and rendered-check results remain in ignored `outputs/dashboard-qa/`; no QA accounts or sample work are added to the live application.
