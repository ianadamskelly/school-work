# Consistent interface icons — 7 October 2026

Replaced duplicated hand-drawn SVGs and decorative text glyphs with Lucide React 1.52.0. The shared `src/components/icon.tsx` component uses static imports, a consistent 2px stroke and fixed dimensions: 16px controls, 20px navigation and 24px card icons. Decorative icons are hidden from assistive technology; icon-only navigation and the password visibility control retain accessible labels. The Progress brand mark remains unchanged.

The migration covers the app shell, home, work, objectives, daily entry/history, weekly and monthly reports, team review, administrator screens and login. Replaced the password Show/Hide text with working eye/eye-off icons. Fixed icon-container compression and narrow monthly-review controls discovered in browser testing.

Verification:

- 18/18 backend checks and 92/92 browser checks passed using disposable local data.
- The new browser assertion checks Lucide classes, consistent strokes, square bounds and decorative accessibility attributes across 12 populated routes.
- The browser suite includes 76 responsive checks at 320, 390, 768 and 1448px, plus the existing account, reporting, attachment and three-role journeys.
- Lint, TypeScript and standalone production build passed. No application-owned inline SVG drawings remain.
- Visually inspected the desktop role templates and manager review screens and the populated mobile daily form.

Screenshots: [role templates](2026-10-07-icon-evidence/templates-desktop.png), [mobile daily update](2026-10-07-icon-evidence/daily-mobile.png), [manager report](2026-10-07-icon-evidence/manager-report-desktop.png), [login](2026-10-07-icon-evidence/login-desktop.png).

Not committed, pushed or deployed during this request. Production records were not changed. Chromium/local verification does not establish Safari/Firefox or physical-device behavior.
