import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
// Person-owned records allow explicit team memberships to be added later.
export const records = sqliteTable('journal_records', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  kind: text('kind').notNull(), data: text('data').notNull(),
  revision: text('revision').notNull(),
}, t => [index('records_owner_kind').on(t.owner, t.kind)]);

export const people = sqliteTable('journal_people', {
  id: text('id').primaryKey(), email: text('email').notNull(),
  name: text('name').notNull(), department: text('department').notNull().default(''),
  managerId: text('manager_id'),
}, t => [index('people_manager').on(t.managerId)]);
export const connections = sqliteTable('journal_connections', {
  id: text('id').primaryKey(), fromId: text('from_id').notNull(),
  toEmail: text('to_email').notNull(), direction: text('direction').notNull(),
  state: text('state').notNull(), createdAt: text('created_at').notNull(),
}, t=>[index('connections_target').on(t.toEmail)]);
export const events = sqliteTable('journal_events', {
  id:text('id').primaryKey(), owner:text('owner').notNull(),
  managerId:text('manager_id').notNull(), objectiveId:text('objective_id').notNull(),
  type:text('type').notNull(), payload:text('payload').notNull(), at:text('at').notNull(),
}, t=>[index('events_owner').on(t.owner)]);
export const submissions = sqliteTable('journal_submissions', {
  id:text('id').primaryKey(), employeeId:text('employee_id').notNull(),
  managerId:text('manager_id').notNull(), start:text('start').notNull(),
  snapshot:text('snapshot').notNull(), metrics:text('metrics').notNull(),
  submittedAt:text('submitted_at').notNull(), reviewedAt:text('reviewed_at'),
  periodType:text('period_type').notNull().default('weekly'),
}, t=>[index('submissions_manager_week').on(t.managerId,t.start)]);
export * from './auth-schema';

export const reportFeedback=sqliteTable('journal_report_feedback',{
 id:text('id').primaryKey(),submissionId:text('submission_id').notNull().references(()=>submissions.id),managerId:text('manager_id').notNull(),employeeId:text('employee_id').notNull(),message:text('message').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('report_feedback_employee').on(t.employeeId),index('report_feedback_submission').on(t.submissionId)]);
