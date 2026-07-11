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

## Deploy on Coolify (hilal.hia.edu.so)

The repo ships with a `Dockerfile`, so Coolify can build and run it directly.

1. **DNS first.** At your DNS provider for `hia.edu.so`, add an **A record** for
   `hilal` pointing to your Coolify server's public IP address. Wait until
   `hilal.hia.edu.so` resolves (a few minutes usually).
2. **Create the app.** In Coolify: *Projects → Add resource → Public Repository*,
   paste `https://github.com/ianadamskelly/school-work.git`, branch `main`.
   Coolify detects the Dockerfile automatically (Build Pack: **Dockerfile**).
   Port is **3000**.
3. **Set the domain.** In the app's settings, set Domain to
   `https://hilal.hia.edu.so`. Coolify's proxy will fetch a Let's Encrypt
   certificate automatically once DNS resolves.
4. **Environment variable.** Add `SESSION_SECRET` with a long random value
   (e.g. run `openssl rand -hex 32` and paste the result). The app refuses to
   start in production without it — that's deliberate.
5. **Persistent storage — do not skip.** Add a **Volume Mount** with destination
   path `/app/data`. This is where the SQLite database lives; without it, every
   redeploy wipes all users and logged work.
6. **Deploy.** First visit `https://hilal.hia.edu.so`, sign in as the admin,
   and immediately change all three seeded passwords (Admin → Everyone →
   Reset password).

Redeploys (pushing to `main` and clicking Deploy, or enabling auto-deploy) keep
the database because it lives on the volume.

**Backups:** the whole system state is the single file `school.db` inside the
`/app/data` volume on the server. Copy it somewhere safe on a schedule — that
is a complete backup.

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
