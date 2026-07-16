CREATE TABLE `inventory` (
	`code` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`finish` text NOT NULL,
	`china` integer DEFAULT 0 NOT NULL,
	`transit` integer DEFAULT 0 NOT NULL,
	`port` integer DEFAULT 0 NOT NULL,
	`gh` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`total_quantity` integer NOT NULL,
	`china_quantity` integer NOT NULL,
	`transit_quantity` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`quantity` integer NOT NULL,
	`source` text NOT NULL,
	`stage` text NOT NULL,
	`due_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
