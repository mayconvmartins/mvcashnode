-- AlterTable
ALTER TABLE `webhook_sources` ADD COLUMN `is_subscriber_webhook` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `webhook_sources_is_subscriber_webhook_idx` ON `webhook_sources`(`is_subscriber_webhook`);
