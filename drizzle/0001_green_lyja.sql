CREATE TABLE `journal_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`from_id` text NOT NULL,
	`to_email` text NOT NULL,
	`direction` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `connections_target` ON `journal_connections` (`to_email`);--> statement-breakpoint
CREATE TABLE `journal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`manager_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_owner` ON `journal_events` (`owner`);--> statement-breakpoint
CREATE TABLE `journal_people` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`manager_id` text
);
--> statement-breakpoint
CREATE INDEX `people_manager` ON `journal_people` (`manager_id`);--> statement-breakpoint
CREATE TABLE `journal_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`manager_id` text NOT NULL,
	`start` text NOT NULL,
	`snapshot` text NOT NULL,
	`metrics` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE INDEX `submissions_manager_week` ON `journal_submissions` (`manager_id`,`start`);