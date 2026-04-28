ALTER TABLE `teas` ADD COLUMN `quantity` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE `teas` SET `quantity` = CASE WHEN `in_stock` = 1 THEN 1 ELSE 0 END;
--> statement-breakpoint
ALTER TABLE `teas` DROP COLUMN `in_stock`;
