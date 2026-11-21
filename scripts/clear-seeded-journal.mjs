import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) {
  throw new Error('Usage: node scripts/clear-seeded-journal.mjs [--apply]');
}
const file = resolve(process.env.DATABASE_PATH || '/app/data/work-journal.sqlite');
const apply = args[0] === '--apply';
const db = new DatabaseSync(file, { readOnly: !apply });
const seeded = "id GLOB 'vps-seed-*' AND kind IN ('strategy-settings', 'strategy', 'objective', 'focus')";
const count = (table, where = '1') => db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get().n;
try {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
  db.exec(apply ? 'BEGIN IMMEDIATE' : 'BEGIN');
  const users = count('auth_user');
  const records = count('journal_records', seeded);
  const other = {
    records: count('journal_records', `NOT (${seeded})`),
    events: count('journal_events'),
    submissions: count('journal_submissions'),
    feedback: count('journal_report_feedback'),
    connections: count('journal_connections'),
  };
  console.log(JSON.stringify({ users, seededRecords: records, otherJournalData: other }));
  if (apply && records > 0) {
    if (!users || Object.values(other).some(Boolean)) {
      throw new Error('Review the database before clearing seeds: the workspace contains other journal data or has no accounts.');
    }
    const backupPath = join(mkdtempSync(join(dirname(file), 'before-seed-reset-')), 'work-journal.sqlite');
    // A separate reader sees the committed pre-reset state under the write lock.
    const source = new DatabaseSync(file, { readOnly: true });
    try {
      await backup(source, backupPath);
    } finally {
      source.close();
    }
    const removed = db.prepare(`DELETE FROM journal_records WHERE ${seeded}`).run().changes;
    if (removed !== records || count('journal_records') !== 0 || count('auth_user') !== users ||
        db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
      throw new Error('Post-reset validation failed.');
    }
    console.log(JSON.stringify({ removed, users, backupPath }));
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
