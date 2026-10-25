CREATE TABLE `scenes` (
	`room_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `id`)
);
--> statement-breakpoint
ALTER TABLE `rooms` ADD `active_scene` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
INSERT INTO `scenes` (`room_id`, `id`, `name`, `position`, `created_at`)
SELECT `id`, 'main', 'Scena 1', 0, `created_at` FROM `rooms`;
