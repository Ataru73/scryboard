CREATE TABLE `assets` (
	`room_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`public` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `asset_id`)
);
