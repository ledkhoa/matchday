ALTER TABLE `highlights` DROP COLUMN `reddit_score`;--> statement-breakpoint
ALTER TABLE `highlights` ADD `goal_fingerprint` text;--> statement-breakpoint
CREATE INDEX `highlights_goal_fingerprint_idx` ON `highlights` (`goal_fingerprint`);
