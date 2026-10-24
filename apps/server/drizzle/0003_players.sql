CREATE TABLE `players` (
	`room_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`secret_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `profile_id`)
);
