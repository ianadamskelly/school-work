import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "school.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS focus_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      focus_area_id INTEGER REFERENCES focus_areas(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      day_code TEXT,
      week_number INTEGER,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tor_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','manager','employee')),
      job_title TEXT NOT NULL DEFAULT '',
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      log_date TEXT NOT NULL,
      category_id INTEGER REFERENCES task_categories(id) ON DELETE SET NULL,
      activity TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      hours REAL NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL DEFAULT '',
      followup_required INTEGER NOT NULL DEFAULT 0,
      followup_date TEXT,
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Completed','In Progress','Pending')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_daily_user_date ON daily_logs(user_id, log_date);

    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      week_of_month INTEGER NOT NULL,
      focus_area_id INTEGER REFERENCES focus_areas(id) ON DELETE SET NULL,
      tasks_completed TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      challenges TEXT NOT NULL DEFAULT '',
      solutions TEXT NOT NULL DEFAULT '',
      people_engaged TEXT NOT NULL DEFAULT '',
      impact TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL DEFAULT 'Low' CHECK (risk_level IN ('High','Medium','Low')),
      next_week_plan TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, year, month, week_of_month)
    );

    CREATE TABLE IF NOT EXISTS monthly_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      strategic_objectives TEXT NOT NULL DEFAULT '',
      key_achievements TEXT NOT NULL DEFAULT '',
      outputs_delivered TEXT NOT NULL DEFAULT '',
      impact_summary TEXT NOT NULL DEFAULT '',
      recommendations TEXT NOT NULL DEFAULT '',
      pending_items TEXT NOT NULL DEFAULT '',
      self_rating INTEGER,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed')),
      manager_rating INTEGER,
      manager_comments TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS monthly_commentaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id INTEGER NOT NULL REFERENCES monthly_reviews(id) ON DELETE CASCADE,
      tor_area_id INTEGER NOT NULL REFERENCES tor_areas(id) ON DELETE CASCADE,
      commentary TEXT NOT NULL DEFAULT '',
      UNIQUE (review_id, tor_area_id)
    );
  `);
}

function seed(db: Database.Database) {
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (userCount.n > 0) return;

  const insertTemplate = db.prepare("INSERT INTO templates (name, description) VALUES (?, ?)");
  const insertFocus = db.prepare("INSERT INTO focus_areas (template_id, name, sort) VALUES (?, ?, ?)");
  const insertCategory = db.prepare(
    "INSERT INTO task_categories (template_id, focus_area_id, name, day_code, week_number, sort) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertTor = db.prepare("INSERT INTO tor_areas (template_id, name, sort) VALUES (?, ?, ?)");
  const insertDept = db.prepare("INSERT INTO departments (template_id, name, sort) VALUES (?, ?, ?)");
  const insertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, role, job_title, manager_id, template_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  const seedAll = db.transaction(() => {
    const templateId = Number(
      insertTemplate.run("Principal", "School principal duties broken down from the TOR").lastInsertRowid
    );

    // DayCode, category, week number, focus area — from the Rotation sheet
    const rotation: [string, string, number, string][] = [
      ["A", "Strategic plan and priorities set", 1, "Strategic Leadership"],
      ["A", "IB compliance and self-evaluation", 2, "Academic Quality"],
      ["A", "Learning walks and QA", 3, "IB Compliance"],
      ["A", "Review monthly operational reports", 4, "Operational Reporting"],
      ["B", "Admissions oversight and exceptional offers", 1, "Admissions Oversight"],
      ["B", "Approve major academic procurement", 2, "Procurement Approval"],
      ["B", "Teacher performance escalations resolved", 3, "Teacher Escalations"],
      ["B", "Exam integrity and chain of custody", 4, "Exam Integrity"],
      ["C", "Safeguarding and incident response", 1, "Safeguarding"],
      ["C", "External compliance and partnerships", 2, "External Compliance"],
      ["C", "Parent escalations and reputational issues", 3, "Parent Escalations"],
      ["C", "PD and succession approvals", 4, "Professional Development"],
    ];

    const focusIds = new Map<string, number>();
    rotation.forEach(([, , , focus], i) => {
      if (!focusIds.has(focus)) {
        focusIds.set(focus, Number(insertFocus.run(templateId, focus, i).lastInsertRowid));
      }
    });
    rotation.forEach(([code, category, week, focus], i) => {
      insertCategory.run(templateId, focusIds.get(focus)!, category, code, week, i);
    });

    // Monthly TOR commentary areas — columns D–J of the Monthly sheet
    [
      "Educational Planning",
      "Staff Development",
      "Policy Review & Compliance",
      "School Improvement",
      "Change Management",
      "Student Support Systems",
      "Community Engagement",
    ].forEach((name, i) => insertTor.run(templateId, name, i));

    ["PYP", "MYP", "DP", "SMT", "Support Staff"].forEach((name, i) =>
      insertDept.run(templateId, name, i)
    );

    const hash = (pw: string) => bcrypt.hashSync(pw, 10);
    insertUser.run("System Admin", "admin@school.test", hash("admin123"), "admin", "System Administrator", null, null);
    const directorId = Number(
      insertUser.run("School Director", "director@school.test", hash("director123"), "manager", "School Director", null, null)
        .lastInsertRowid
    );
    insertUser.run(
      "Pat Principal",
      "principal@school.test",
      hash("principal123"),
      "employee",
      "Principal",
      directorId,
      templateId
    );
  });

  seedAll();
}
