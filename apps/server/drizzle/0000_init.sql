CREATE TABLE `documents` (
	`name` text PRIMARY KEY NOT NULL,
	`state` blob NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`gm_token_hash` text NOT NULL,
	`created_at` text NOT NULL
);
