CREATE TABLE `format_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`checked_at` integer NOT NULL,
	`issue_count` integer NOT NULL,
	`rules_json` text NOT NULL,
	`stats_json` text NOT NULL,
	`issues_json` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `format_checks_document_idx` ON `format_checks` (`document_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
