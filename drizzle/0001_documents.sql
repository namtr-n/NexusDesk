CREATE TABLE `document_text` (
	`document_id` integer PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`source_path` text NOT NULL,
	`stored_file` text NOT NULL,
	`extract_status` text NOT NULL,
	`extract_message` text,
	`char_count` integer DEFAULT 0 NOT NULL,
	`page_count` integer,
	`imported_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `documents_project_idx` ON `documents` (`project_id`);--> statement-breakpoint
CREATE INDEX `documents_sha256_idx` ON `documents` (`sha256`);--> statement-breakpoint
CREATE INDEX `documents_imported_at_idx` ON `documents` (`imported_at`);