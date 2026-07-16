CREATE TABLE `allocation_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shipment_id` integer,
	`code` text NOT NULL,
	`quantity` integer NOT NULL,
	`allocated_quantity` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
