ALTER TABLE `matches` ADD `external_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `matches_external_id_unique` ON `matches` (`external_id`);--> statement-breakpoint
ALTER TABLE `matches` ADD `competition` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `league_logo` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `team_home_logo` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `team_away_logo` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `kickoff_time` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `status` text;
