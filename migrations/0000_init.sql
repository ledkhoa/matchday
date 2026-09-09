CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`title` text NOT NULL,
	`score_home` integer,
	`score_away` integer,
	`scorer` text,
	`minute` text,
	`tag` text,
	`embed_url` text,
	`source_url` text NOT NULL,
	`reddit_url` text NOT NULL,
	`reddit_score` integer DEFAULT 0,
	`posted_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `highlights_match_id_idx` ON `highlights` (`match_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`match_date` text NOT NULL,
	`team_home` text NOT NULL,
	`team_away` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `matches_match_date_idx` ON `matches` (`match_date`);