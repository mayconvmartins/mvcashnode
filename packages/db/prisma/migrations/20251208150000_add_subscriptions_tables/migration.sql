-- CreateTable
CREATE TABLE `mercadopago_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `access_token_enc` TEXT NOT NULL,
    `public_key` VARCHAR(255) NOT NULL,
    `webhook_secret_enc` TEXT NULL,
    `environment` VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    `webhook_url` VARCHAR(500) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `price_monthly` DECIMAL(10, 2) NOT NULL,
    `price_quarterly` DECIMAL(10, 2) NOT NULL,
    `duration_days` INTEGER NOT NULL DEFAULT 30,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `features_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `subscription_plans_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `auto_renew` BOOLEAN NOT NULL DEFAULT false,
    `payment_method` VARCHAR(20) NULL,
    `mp_payment_id` VARCHAR(255) NULL,
    `mp_preference_id` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `subscriptions_user_id_idx`(`user_id`),
    INDEX `subscriptions_plan_id_idx`(`plan_id`),
    INDEX `subscriptions_status_idx`(`status`),
    INDEX `subscriptions_user_id_status_idx`(`user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriber_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `cpf_enc` TEXT NULL,
    `birth_date` DATETIME(3) NULL,
    `address_street` VARCHAR(255) NULL,
    `address_number` VARCHAR(20) NULL,
    `address_complement` VARCHAR(100) NULL,
    `address_neighborhood` VARCHAR(100) NULL,
    `address_city` VARCHAR(100) NULL,
    `address_state` VARCHAR(2) NULL,
    `address_zipcode` VARCHAR(10) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriber_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriber_parameters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `default_exchange_account_id` INTEGER NULL,
    `max_orders_per_hour` INTEGER NULL,
    `min_interval_sec` INTEGER NULL,
    `default_order_type` VARCHAR(20) NOT NULL DEFAULT 'MARKET',
    `slippage_bps` INTEGER NOT NULL DEFAULT 0,
    `default_sl_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_sl_pct` DECIMAL(5, 2) NULL,
    `default_tp_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_tp_pct` DECIMAL(5, 2) NULL,
    `trailing_stop_enabled` BOOLEAN NOT NULL DEFAULT false,
    `trailing_distance_pct` DECIMAL(5, 2) NULL,
    `min_profit_pct` DECIMAL(5, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriber_parameters_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subscription_id` INTEGER NOT NULL,
    `mp_payment_id` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `payment_method` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `subscription_payments_subscription_id_idx`(`subscription_id`),
    INDEX `subscription_payments_mp_payment_id_idx`(`mp_payment_id`),
    INDEX `subscription_payments_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_webhook_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mp_event_id` VARCHAR(255) NOT NULL,
    `mp_event_type` VARCHAR(50) NOT NULL,
    `mp_resource_id` VARCHAR(255) NOT NULL,
    `raw_payload_json` JSON NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `subscription_webhook_events_mp_event_id_key`(`mp_event_id`),
    INDEX `subscription_webhook_events_mp_resource_id_idx`(`mp_resource_id`),
    INDEX `subscription_webhook_events_processed_idx`(`processed`),
    INDEX `subscription_webhook_events_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_profiles` ADD CONSTRAINT `subscriber_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriber_parameters` ADD CONSTRAINT `subscriber_parameters_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_payments` ADD CONSTRAINT `subscription_payments_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
