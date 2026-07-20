CREATE TABLE `commitments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text NOT NULL,
	`order_number` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
