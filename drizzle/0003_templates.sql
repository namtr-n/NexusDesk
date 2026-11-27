CREATE TABLE `format_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`source_name` text,
	`spec_json` text NOT NULL,
	`learned_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `format_checks` ADD `template_id` integer REFERENCES format_templates(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `format_checks` ADD `template_name` text;