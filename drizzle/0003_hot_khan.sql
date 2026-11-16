CREATE TABLE `journal_report_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`manager_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `journal_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `report_feedback_employee` ON `journal_report_feedback` (`employee_id`);--> statement-breakpoint
CREATE INDEX `report_feedback_submission` ON `journal_report_feedback` (`submission_id`);--> statement-breakpoint
ALTER TABLE `journal_submissions` ADD `period_type` text DEFAULT 'weekly' NOT NULL;