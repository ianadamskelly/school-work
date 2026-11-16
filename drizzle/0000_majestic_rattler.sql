CREATE TABLE `journal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`revision` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_owner_kind` ON `journal_records` (`owner`,`kind`);