-- CreateTable
CREATE TABLE `transfi_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `merchant_id` VARCHAR(255) NOT NULL,
    `authorization_token_enc` TEXT NOT NULL,
    `environment` VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    `webhook_url` VARCHAR(500) NULL,
    `webhook_secret_enc` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transfi_webhook_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transfi_event_id` VARCHAR(255) NOT NULL,
    `transfi_event_type` VARCHAR(50) NOT NULL,
    `transfi_resource_id` VARCHAR(255) NOT NULL,
    `raw_payload_json` JSON NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `transfi_webhook_events_transfi_event_id_key`(`transfi_event_id`),
    INDEX `transfi_webhook_events_transfi_resource_id_idx`(`transfi_resource_id`),
    INDEX `transfi_webhook_events_processed_idx`(`processed`),
    INDEX `transfi_webhook_events_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `subscription_payments` MODIFY `mp_payment_id` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `subscription_payments` ADD COLUMN `transfi_payment_id` VARCHAR(255) NULL;
ALTER TABLE `subscription_payments` ADD COLUMN `transfi_order_id` VARCHAR(255) NULL;

-- CreateIndex
CREATE INDEX `subscription_payments_transfi_payment_id_idx` ON `subscription_payments`(`transfi_payment_id`);

-- CreateIndex
CREATE INDEX `subscription_payments_transfi_order_id_idx` ON `subscription_payments`(`transfi_order_id`);

-- AlterTable
ALTER TABLE `subscription_webhook_events` MODIFY `mp_event_id` VARCHAR(255) NULL,
    MODIFY `mp_event_type` VARCHAR(50) NULL,
    MODIFY `mp_resource_id` VARCHAR(255) NULL;
