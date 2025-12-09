-- AlterTable
ALTER TABLE `webhook_sources` ADD COLUMN `monitor_enabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `webhook_monitor_alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `webhook_source_id` INTEGER NOT NULL,
    `webhook_event_id` INTEGER NOT NULL,
    `exchange_account_id` INTEGER NOT NULL,
    `symbol` VARCHAR(50) NOT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `price_alert` DECIMAL(36, 18) NOT NULL,
    `price_minimum` DECIMAL(36, 18) NOT NULL,
    `current_price` DECIMAL(36, 18) NULL,
    `state` VARCHAR(50) NOT NULL DEFAULT 'MONITORING',
    `cycles_without_new_low` INTEGER NOT NULL DEFAULT 0,
    `last_price_check_at` DATETIME(3) NULL,
    `executed_trade_job_id` INTEGER NULL,
    `cancel_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `webhook_monitor_alerts_webhook_source_id_idx`(`webhook_source_id`),
    INDEX `webhook_monitor_alerts_exchange_account_id_symbol_trade_mode_state_idx`(`exchange_account_id`, `symbol`, `trade_mode`, `state`),
    INDEX `webhook_monitor_alerts_state_idx`(`state`),
    INDEX `webhook_monitor_alerts_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_monitor_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `monitor_enabled` BOOLEAN NOT NULL DEFAULT true,
    `check_interval_sec` INTEGER NOT NULL DEFAULT 30,
    `lateral_tolerance_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0.30,
    `lateral_cycles_min` INTEGER NOT NULL DEFAULT 4,
    `rise_trigger_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0.75,
    `rise_cycles_min` INTEGER NOT NULL DEFAULT 2,
    `max_fall_pct` DECIMAL(5, 2) NOT NULL DEFAULT 6.00,
    `max_monitoring_time_min` INTEGER NOT NULL DEFAULT 60,
    `cooldown_after_execution_min` INTEGER NOT NULL DEFAULT 30,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `webhook_monitor_config_user_id_key`(`user_id`),
    INDEX `webhook_monitor_config_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `webhook_monitor_alerts` ADD CONSTRAINT `webhook_monitor_alerts_webhook_source_id_fkey` FOREIGN KEY (`webhook_source_id`) REFERENCES `webhook_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_monitor_alerts` ADD CONSTRAINT `webhook_monitor_alerts_webhook_event_id_fkey` FOREIGN KEY (`webhook_event_id`) REFERENCES `webhook_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_monitor_alerts` ADD CONSTRAINT `webhook_monitor_alerts_exchange_account_id_fkey` FOREIGN KEY (`exchange_account_id`) REFERENCES `exchange_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_monitor_config` ADD CONSTRAINT `webhook_monitor_config_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

