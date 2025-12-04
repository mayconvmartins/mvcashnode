-- AlterTable
ALTER TABLE `webhook_sources` ADD COLUMN `alert_group_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `alert_group_id` VARCHAR(255) NULL;