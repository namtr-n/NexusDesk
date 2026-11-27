CREATE TABLE `prompt_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prompt_id` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompt_versions_prompt_idx` ON `prompt_versions` (`prompt_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`project_id` integer,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prompts_updated_at_idx` ON `prompts` (`updated_at`);--> statement-breakpoint
ALTER TABLE `ai_analyses` ADD `prompt_id` integer REFERENCES prompts(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `ai_analyses` ADD `prompt_title` text;--> statement-breakpoint
CREATE INDEX `ai_analyses_prompt_idx` ON `ai_analyses` (`document_id`,`prompt_id`,`created_at`);--> statement-breakpoint
-- Viết tay: bảng tìm kiếm toàn văn FTS5 cho prompt (rowid = prompts.id).
-- remove_diacritics 2: gõ "chinh ta" vẫn tìm thấy "chính tả".
CREATE VIRTUAL TABLE `prompts_fts` USING fts5(title, content, tags, category, tokenize = 'unicode61 remove_diacritics 2');--> statement-breakpoint
CREATE TRIGGER `prompts_fts_ai` AFTER INSERT ON `prompts` BEGIN
	INSERT INTO prompts_fts(rowid, title, content, tags, category)
	VALUES (new.id, new.title, new.content, (SELECT ifnull(group_concat(value, ' '), '') FROM json_each(new.tags_json)), new.category);
END;--> statement-breakpoint
CREATE TRIGGER `prompts_fts_ad` AFTER DELETE ON `prompts` BEGIN
	DELETE FROM prompts_fts WHERE rowid = old.id;
END;--> statement-breakpoint
CREATE TRIGGER `prompts_fts_au` AFTER UPDATE OF title, content, tags_json, category ON `prompts` BEGIN
	DELETE FROM prompts_fts WHERE rowid = old.id;
	INSERT INTO prompts_fts(rowid, title, content, tags, category)
	VALUES (new.id, new.title, new.content, (SELECT ifnull(group_concat(value, ' '), '') FROM json_each(new.tags_json)), new.category);
END;