CREATE TABLE `commitment_document_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`code` text NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commitment_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`reservation_code` text,
	`order_number` text,
	`note` text DEFAULT '' NOT NULL,
	`loan_items` integer DEFAULT false NOT NULL,
	`legacy_commitment_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commitment_documents_reservation_code_unique` ON `commitment_documents` (`reservation_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `commitment_documents_legacy_commitment_id_unique` ON `commitment_documents` (`legacy_commitment_id`);