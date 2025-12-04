-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_email_idx`(`email`),
    INDEX `users_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `full_name` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NULL,
    `whatsapp_phone` VARCHAR(20) NULL,
    `position_alerts_enabled` BOOLEAN NOT NULL DEFAULT true,
    `twofa_enabled` BOOLEAN NOT NULL DEFAULT false,
    `twofa_secret` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `role` VARCHAR(50) NOT NULL,

    INDEX `user_roles_user_id_idx`(`user_id`),
    UNIQUE INDEX `user_roles_user_id_role_key`(`user_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `login_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `success` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `login_history_user_id_idx`(`user_id`),
    INDEX `login_history_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` INTEGER NULL,
    `action` VARCHAR(50) NOT NULL,
    `changes_json` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `request_id` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `service` VARCHAR(50) NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(50) NULL,
    `entity_id` INTEGER NULL,
    `severity` VARCHAR(20) NOT NULL,
    `message` TEXT NOT NULL,
    `metadata_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `system_audit_logs_service_created_at_idx`(`service`, `created_at`),
    INDEX `system_audit_logs_severity_created_at_idx`(`severity`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `exchange` VARCHAR(50) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `is_simulation` BOOLEAN NOT NULL DEFAULT false,
    `api_key_enc` TEXT NULL,
    `api_secret_enc` TEXT NULL,
    `proxy_url` VARCHAR(500) NULL,
    `testnet` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `initial_balances_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exchange_accounts_user_id_idx`(`user_id`),
    INDEX `exchange_accounts_is_simulation_idx`(`is_simulation`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_balances_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exchange_account_id` INTEGER NOT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `asset` VARCHAR(20) NOT NULL,
    `free` DECIMAL(36, 18) NOT NULL,
    `locked` DECIMAL(36, 18) NOT NULL,
    `last_sync_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `account_balances_cache_exchange_account_id_trade_mode_idx`(`exchange_account_id`, `trade_mode`),
    UNIQUE INDEX `account_balances_cache_exchange_account_id_trade_mode_asset_key`(`exchange_account_id`, `trade_mode`, `asset`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vaults` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vaults_user_id_idx`(`user_id`),
    INDEX `vaults_trade_mode_idx`(`trade_mode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vault_balances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vault_id` INTEGER NOT NULL,
    `asset` VARCHAR(20) NOT NULL,
    `balance` DECIMAL(36, 18) NOT NULL DEFAULT 0,
    `reserved` DECIMAL(36, 18) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vault_balances_vault_id_idx`(`vault_id`),
    UNIQUE INDEX `vault_balances_vault_id_asset_key`(`vault_id`, `asset`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vault_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vault_id` INTEGER NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `asset` VARCHAR(20) NOT NULL,
    `amount` DECIMAL(36, 18) NOT NULL,
    `trade_job_id` INTEGER NULL,
    `meta_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vault_transactions_vault_id_idx`(`vault_id`),
    INDEX `vault_transactions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trade_parameters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `exchange_account_id` INTEGER NOT NULL,
    `symbol` VARCHAR(50) NOT NULL,
    `side` VARCHAR(10) NOT NULL,
    `quote_amount_fixed` DECIMAL(36, 18) NULL,
    `quote_amount_pct_balance` DECIMAL(5, 2) NULL,
    `max_orders_per_hour` INTEGER NULL,
    `min_interval_sec` INTEGER NULL,
    `order_type_default` VARCHAR(20) NOT NULL DEFAULT 'MARKET',
    `slippage_bps` INTEGER NOT NULL DEFAULT 0,
    `default_sl_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_sl_pct` DECIMAL(5, 2) NULL,
    `default_tp_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_tp_pct` DECIMAL(5, 2) NULL,
    `trailing_stop_enabled` BOOLEAN NOT NULL DEFAULT false,
    `trailing_distance_pct` DECIMAL(5, 2) NULL,
    `vault_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trade_parameters_exchange_account_id_symbol_idx`(`exchange_account_id`, `symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` INTEGER NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `webhook_code` VARCHAR(100) NOT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `allowed_ips_json` JSON NULL,
    `require_signature` BOOLEAN NOT NULL DEFAULT false,
    `signing_secret_enc` TEXT NULL,
    `rate_limit_per_min` INTEGER NOT NULL DEFAULT 60,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `admin_locked` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `webhook_sources_webhook_code_key`(`webhook_code`),
    INDEX `webhook_sources_webhook_code_idx`(`webhook_code`),
    INDEX `webhook_sources_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_webhook_bindings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `webhook_source_id` INTEGER NOT NULL,
    `exchange_account_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `weight` DECIMAL(5, 2) NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `account_webhook_bindings_webhook_source_id_idx`(`webhook_source_id`),
    UNIQUE INDEX `account_webhook_bindings_webhook_source_id_exchange_account__key`(`webhook_source_id`, `exchange_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `webhook_source_id` INTEGER NOT NULL,
    `target_account_id` INTEGER NOT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `event_uid` VARCHAR(255) NOT NULL,
    `symbol_raw` VARCHAR(100) NOT NULL,
    `symbol_normalized` VARCHAR(100) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `timeframe` VARCHAR(10) NULL,
    `price_reference` DECIMAL(36, 18) NULL,
    `raw_text` TEXT NULL,
    `raw_payload_json` JSON NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    `validation_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    INDEX `webhook_events_webhook_source_id_idx`(`webhook_source_id`),
    INDEX `webhook_events_target_account_id_idx`(`target_account_id`),
    INDEX `webhook_events_status_idx`(`status`),
    INDEX `webhook_events_created_at_idx`(`created_at`),
    UNIQUE INDEX `webhook_events_webhook_source_id_event_uid_target_account_id_key`(`webhook_source_id`, `event_uid`, `target_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_blocked_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `webhook_source_id` INTEGER NOT NULL,
    `ip` VARCHAR(45) NOT NULL,
    `reason` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_blocked_attempts_webhook_source_id_idx`(`webhook_source_id`),
    INDEX `webhook_blocked_attempts_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trade_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `webhook_event_id` INTEGER NULL,
    `exchange_account_id` INTEGER NOT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `symbol` VARCHAR(50) NOT NULL,
    `side` VARCHAR(10) NOT NULL,
    `order_type` VARCHAR(20) NOT NULL DEFAULT 'MARKET',
    `quote_amount` DECIMAL(36, 18) NULL,
    `base_quantity` DECIMAL(36, 18) NULL,
    `limit_price` DECIMAL(36, 18) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    `reason_code` VARCHAR(100) NULL,
    `reason_message` TEXT NULL,
    `vault_id` INTEGER NULL,
    `limit_order_expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trade_jobs_exchange_account_id_status_idx`(`exchange_account_id`, `status`),
    INDEX `trade_jobs_status_idx`(`status`),
    INDEX `trade_jobs_trade_mode_idx`(`trade_mode`),
    INDEX `trade_jobs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trade_executions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trade_job_id` INTEGER NOT NULL,
    `exchange_account_id` INTEGER NOT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `exchange` VARCHAR(50) NOT NULL,
    `exchange_order_id` VARCHAR(255) NULL,
    `client_order_id` VARCHAR(255) NOT NULL,
    `status_exchange` VARCHAR(50) NOT NULL,
    `executed_qty` DECIMAL(36, 18) NOT NULL,
    `cumm_quote_qty` DECIMAL(36, 18) NOT NULL,
    `avg_price` DECIMAL(36, 18) NOT NULL,
    `fills_json` JSON NULL,
    `raw_response_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `trade_executions_trade_job_id_idx`(`trade_job_id`),
    INDEX `trade_executions_exchange_account_id_idx`(`exchange_account_id`),
    INDEX `trade_executions_trade_mode_idx`(`trade_mode`),
    INDEX `trade_executions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trade_positions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exchange_account_id` INTEGER NOT NULL,
    `trade_mode` VARCHAR(20) NOT NULL,
    `symbol` VARCHAR(50) NOT NULL,
    `side` VARCHAR(10) NOT NULL DEFAULT 'LONG',
    `trade_job_id_open` INTEGER NOT NULL,
    `qty_total` DECIMAL(36, 18) NOT NULL,
    `qty_remaining` DECIMAL(36, 18) NOT NULL,
    `price_open` DECIMAL(36, 18) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `realized_profit_usd` DECIMAL(36, 18) NOT NULL DEFAULT 0,
    `sl_enabled` BOOLEAN NOT NULL DEFAULT false,
    `sl_pct` DECIMAL(5, 2) NULL,
    `tp_enabled` BOOLEAN NOT NULL DEFAULT false,
    `tp_pct` DECIMAL(5, 2) NULL,
    `trailing_enabled` BOOLEAN NOT NULL DEFAULT false,
    `trailing_distance_pct` DECIMAL(5, 2) NULL,
    `trailing_max_price` DECIMAL(36, 18) NULL,
    `sl_triggered` BOOLEAN NOT NULL DEFAULT false,
    `tp_triggered` BOOLEAN NOT NULL DEFAULT false,
    `trailing_triggered` BOOLEAN NOT NULL DEFAULT false,
    `partial_tp_triggered` BOOLEAN NOT NULL DEFAULT false,
    `lock_sell_by_webhook` BOOLEAN NOT NULL DEFAULT false,
    `close_reason` VARCHAR(50) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trade_positions_exchange_account_id_symbol_status_idx`(`exchange_account_id`, `symbol`, `status`),
    INDEX `trade_positions_status_idx`(`status`),
    INDEX `trade_positions_trade_mode_idx`(`trade_mode`),
    INDEX `trade_positions_created_at_idx`(`created_at`),
    UNIQUE INDEX `trade_positions_trade_job_id_open_key`(`trade_job_id_open`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `position_fills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `trade_execution_id` INTEGER NOT NULL,
    `side` VARCHAR(10) NOT NULL,
    `qty` DECIMAL(36, 18) NOT NULL,
    `price` DECIMAL(36, 18) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `position_fills_position_id_idx`(`position_id`),
    INDEX `position_fills_trade_execution_id_idx`(`trade_execution_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_global_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `api_url` VARCHAR(500) NOT NULL,
    `api_key` VARCHAR(255) NULL,
    `instance_name` VARCHAR(100) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_notifications_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `position_opened_enabled` BOOLEAN NOT NULL DEFAULT true,
    `position_closed_enabled` BOOLEAN NOT NULL DEFAULT true,
    `stop_loss_enabled` BOOLEAN NOT NULL DEFAULT true,
    `take_profit_enabled` BOOLEAN NOT NULL DEFAULT true,
    `vault_alerts_enabled` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `whatsapp_notifications_config_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `position_alerts_sent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `alert_type` VARCHAR(50) NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `position_alerts_sent_position_id_idx`(`position_id`),
    UNIQUE INDEX `position_alerts_sent_position_id_alert_type_key`(`position_id`, `alert_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vault_alerts_sent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vault_id` INTEGER NOT NULL,
    `alert_type` VARCHAR(50) NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vault_alerts_sent_vault_id_idx`(`vault_id`),
    UNIQUE INDEX `vault_alerts_sent_vault_id_alert_type_sent_at_key`(`vault_id`, `alert_type`, `sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `login_history` ADD CONSTRAINT `login_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exchange_accounts` ADD CONSTRAINT `exchange_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_balances_cache` ADD CONSTRAINT `account_balances_cache_exchange_account_id_fkey` FOREIGN KEY (`exchange_account_id`) REFERENCES `exchange_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vaults` ADD CONSTRAINT `vaults_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vault_balances` ADD CONSTRAINT `vault_balances_vault_id_fkey` FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vault_transactions` ADD CONSTRAINT `vault_transactions_vault_id_fkey` FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_parameters` ADD CONSTRAINT `trade_parameters_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_parameters` ADD CONSTRAINT `trade_parameters_exchange_account_id_fkey` FOREIGN KEY (`exchange_account_id`) REFERENCES `exchange_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_parameters` ADD CONSTRAINT `trade_parameters_vault_id_fkey` FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_sources` ADD CONSTRAINT `webhook_sources_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_webhook_bindings` ADD CONSTRAINT `account_webhook_bindings_webhook_source_id_fkey` FOREIGN KEY (`webhook_source_id`) REFERENCES `webhook_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_webhook_bindings` ADD CONSTRAINT `account_webhook_bindings_exchange_account_id_fkey` FOREIGN KEY (`exchange_account_id`) REFERENCES `exchange_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_events` ADD CONSTRAINT `webhook_events_webhook_source_id_fkey` FOREIGN KEY (`webhook_source_id`) REFERENCES `webhook_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_blocked_attempts` ADD CONSTRAINT `webhook_blocked_attempts_webhook_source_id_fkey` FOREIGN KEY (`webhook_source_id`) REFERENCES `webhook_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_jobs` ADD CONSTRAINT `trade_jobs_exchange_account_id_fkey` FOREIGN KEY (`exchange_account_id`) REFERENCES `exchange_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_executions` ADD CONSTRAINT `trade_executions_trade_job_id_fkey` FOREIGN KEY (`trade_job_id`) REFERENCES `trade_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_executions` ADD CONSTRAINT `trade_executions_exchange_account_id_fkey` FOREIGN KEY (`exchange_account_id`) REFERENCES `exchange_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_positions` ADD CONSTRAINT `trade_positions_exchange_account_id_fkey` FOREIGN KEY (`exchange_account_id`) REFERENCES `exchange_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_positions` ADD CONSTRAINT `trade_positions_trade_job_id_open_fkey` FOREIGN KEY (`trade_job_id_open`) REFERENCES `trade_jobs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `position_fills` ADD CONSTRAINT `position_fills_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `trade_positions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `position_fills` ADD CONSTRAINT `position_fills_trade_execution_id_fkey` FOREIGN KEY (`trade_execution_id`) REFERENCES `trade_executions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
