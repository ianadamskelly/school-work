# School Work Tracker

Performance tracking for school staff. Each employee's job description is broken into
task categories and focus areas (a "role template"), which then guide their daily logs,
weekly summaries, and monthly TOR reviews. Line managers review and sign off each month.

Built with Next.js and SQLite — everything lives in this folder, no external services.

## Run it

```bash
npm install
npm run dev        # development, http://localhost:3000
```

For real use:

```bash
npm run build
SESSION_SECRET="some-long-random-string" npm start
```

The database is created automatically at `data/school.db` on first run, seeded with
the Principal role template (12 task categories, A/B/C day rotation, 7 monthly TOR
areas) and three demo accounts:

| Account | Email | Password |
| --- | --- | --- |
| Admin | admin@school.test | admin123 |
| Line manager | director@school.test | director123 |
| Employee | principal@school.test | principal123 |

Change these passwords (Admin → Everyone → Reset password) before letting real users in.
To start from a clean slate, stop the server and delete the `data` folder.

## How it fits together

- **Admin** adds people, sets who reports to whom, and builds role templates.
- A **role template** = task categories (each optionally slotted into the rotation:
  day code A/B/C × week 1–4 of the month), focus areas, monthly TOR areas, departments.
- **Employees** see a suggested focus each working day (Mon=A, Tue=B, Wed=C, Thu=A, Fri=B,
  combined with the week of the month), log daily entries, write a weekly summary, and
  submit a monthly review with commentary per TOR area plus a self-rating.
- **Line managers** see a team dashboard (activity, overdue follow-ups, pending reviews)
  and sign off monthly reviews with their own rating and comments. Once signed off, the
  month is locked.
- Follow-ups past their date are flagged **Overdue** automatically, everywhere.
