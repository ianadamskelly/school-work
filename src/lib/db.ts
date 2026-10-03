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

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?")
    .get(table, column);
}

// Adds columns introduced after the first deployment; safe to run on every start.
function upgrade(db: Database.Database) {
  const add = (table: string, column: string, ddl: string) => {
    if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  add("weekly_summaries", "focus_area_2_id", "focus_area_2_id INTEGER REFERENCES focus_areas(id) ON DELETE SET NULL");
  add("weekly_summaries", "status", "status TEXT NOT NULL DEFAULT 'draft'");
  add("weekly_summaries", "progress_percent", "progress_percent INTEGER");
  add("weekly_summaries", "manager_comment", "manager_comment TEXT NOT NULL DEFAULT ''");
  add("weekly_summaries", "seen_at", "seen_at TEXT");
  add("monthly_reviews", "objective_outcome", "objective_outcome TEXT NOT NULL DEFAULT ''");
  add("monthly_plans", "manager_feedback", "manager_feedback TEXT NOT NULL DEFAULT ''");
  add("monthly_plans", "submitted_at", "submitted_at TEXT");
  add("monthly_plans", "returned_at", "returned_at TEXT");
  add("work_items", "monthly_objective_id", "monthly_objective_id INTEGER REFERENCES monthly_objectives(id) ON DELETE SET NULL");
  add("work_items", "monthly_focus_area_id", "monthly_focus_area_id INTEGER REFERENCES monthly_focus_areas(id) ON DELETE SET NULL");

  // Preserve every existing single-objective plan as a member of the new
  // multi-objective plan structure.
  db.exec(`
    INSERT OR IGNORE INTO monthly_plan_objectives (plan_id, objective_id)
    SELECT id, objective_id FROM monthly_plans;
  `);

  // Preserve the original lightweight daily entries as historical work updates.
  // New activity is recorded against work items, but historical reporting must
  // remain able to see entries created before the work execution overhaul.
  db.exec(`
    INSERT OR IGNORE INTO work_updates (user_id, work_item_id, update_date, text, status_after, legacy_daily_log_id)
    SELECT user_id, NULL, log_date,
           trim(activity || CASE WHEN outcome != '' THEN ': ' || outcome ELSE '' END),
           lower(replace(status, ' ', '_')), id
    FROM daily_logs;
  `);

  // Translate legacy plan-to-strategy selections into staff-owned monthly
  // objectives. The historical strategic link remains intact.
  db.exec(`
    INSERT OR IGNORE INTO monthly_objectives (plan_id, legacy_strategic_objective_id, title, intended_outcome, sort)
    SELECT mpo.plan_id, o.id, o.title, o.description,
           0
    FROM monthly_plan_objectives mpo JOIN objectives o ON o.id = mpo.objective_id;
    INSERT OR IGNORE INTO monthly_objective_strategic_links (monthly_objective_id, strategic_objective_id)
    SELECT mo.id, mo.legacy_strategic_objective_id FROM monthly_objectives mo
    WHERE mo.legacy_strategic_objective_id IS NOT NULL;
  `);
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

    CREATE TABLE IF NOT EXISTS objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      objective_id INTEGER NOT NULL REFERENCES objectives(id),
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')),
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS monthly_plan_focus (
      plan_id INTEGER NOT NULL REFERENCES monthly_plans(id) ON DELETE CASCADE,
      focus_area_id INTEGER NOT NULL REFERENCES focus_areas(id) ON DELETE CASCADE,
      UNIQUE (plan_id, focus_area_id)
    );

    CREATE TABLE IF NOT EXISTS monthly_plan_objectives (
      plan_id INTEGER NOT NULL REFERENCES monthly_plans(id) ON DELETE CASCADE,
      objective_id INTEGER NOT NULL REFERENCES objectives(id),
      PRIMARY KEY (plan_id, objective_id)
    );

    CREATE TABLE IF NOT EXISTS weekly_objective_progress (
      summary_id INTEGER NOT NULL REFERENCES weekly_summaries(id) ON DELETE CASCADE,
      objective_id INTEGER NOT NULL REFERENCES objectives(id),
      progress_percent INTEGER NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
      PRIMARY KEY (summary_id, objective_id)
    );

    CREATE TABLE IF NOT EXISTS work_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      monthly_plan_id INTEGER REFERENCES monthly_plans(id) ON DELETE SET NULL,
      objective_id INTEGER REFERENCES objectives(id) ON DELETE SET NULL,
      focus_area_id INTEGER REFERENCES focus_areas(id) ON DELETE SET NULL,
      work_type TEXT NOT NULL CHECK (work_type IN ('planned', 'recurring', 'reactive')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'blocked', 'completed', 'deferred', 'cancelled')),
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_items_user_status_due ON work_items(user_id, status, due_date);

    CREATE TABLE IF NOT EXISTS work_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      work_item_id INTEGER REFERENCES work_items(id) ON DELETE SET NULL,
      update_date TEXT NOT NULL,
      text TEXT NOT NULL,
      status_after TEXT,
      legacy_daily_log_id INTEGER UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_updates_user_date ON work_updates(user_id, update_date);
    CREATE INDEX IF NOT EXISTS idx_work_updates_item_date ON work_updates(work_item_id, update_date);

    CREATE TABLE IF NOT EXISTS work_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_update_id INTEGER NOT NULL REFERENCES work_updates(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_evidence_update ON work_evidence(work_update_id);

    CREATE TABLE IF NOT EXISTS blockers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_item_id INTEGER REFERENCES work_items(id) ON DELETE SET NULL,
      work_update_id INTEGER REFERENCES work_updates(id) ON DELETE SET NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'needs_attention' CHECK (severity IN ('normal', 'needs_attention', 'critical')),
      requires_manager_attention INTEGER NOT NULL DEFAULT 0,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolution_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_blockers_open ON blockers(resolved, requires_manager_attention);

    CREATE TABLE IF NOT EXISTS monthly_objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES monthly_plans(id) ON DELETE CASCADE,
      legacy_strategic_objective_id INTEGER REFERENCES objectives(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      intended_outcome TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (plan_id, legacy_strategic_objective_id)
    );

    CREATE TABLE IF NOT EXISTS monthly_objective_strategic_links (
      monthly_objective_id INTEGER NOT NULL REFERENCES monthly_objectives(id) ON DELETE CASCADE,
      strategic_objective_id INTEGER NOT NULL REFERENCES objectives(id),
      PRIMARY KEY (monthly_objective_id, strategic_objective_id)
    );

    CREATE TABLE IF NOT EXISTS monthly_focus_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monthly_objective_id INTEGER NOT NULL REFERENCES monthly_objectives(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      target_outcome TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  upgrade(db);
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

    const insertObjective = db.prepare(
      "INSERT INTO objectives (manager_id, title, description) VALUES (?, ?, ?)"
    );
    insertObjective.run(
      directorId,
      "Achieve full IB compliance ahead of the five-year evaluation",
      "Close all self-evaluation gaps and have evidence files ready for the visiting team."
    );
    insertObjective.run(
      directorId,
      "Raise teaching quality through observation and coaching",
      "Every teacher observed at least once, with feedback and follow-up support in place."
    );
  });

  seedAll();
}
