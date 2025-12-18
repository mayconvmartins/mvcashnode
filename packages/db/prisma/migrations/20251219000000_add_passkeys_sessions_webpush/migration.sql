-- CreateTable: Passkeys (WebAuthn)
CREATE TABLE `passkeys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `credential_id` VARCHAR(500) NOT NULL,
    `public_key` TEXT NOT NULL,
    `counter` BIGINT NOT NULL DEFAULT 0,
    `device_name` VARCHAR(255) NULL,
    `transports` VARCHAR(255) NULL,
    `user_agent` TEXT NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `passkeys_credential_id_key`(`credential_id`),
    INDEX `passkeys_user_id_idx`(`user_id`),
    INDEX `passkeys_credential_id_idx`(`credential_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: User Sessions (Multiple Devices)
CREATE TABLE `user_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `session_token` VARCHAR(500) NOT NULL,
    `refresh_token` VARCHAR(500) NOT NULL,
    `device_name` VARCHAR(255) NULL,
    `device_type` VARCHAR(50) NULL,
    `browser` VARCHAR(100) NULL,
    `os` VARCHAR(100) NULL,
    `user_agent` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `remember_me` BOOLEAN NOT NULL DEFAULT false,
    `is_passkey_auth` BOOLEAN NOT NULL DEFAULT false,
    `expires_at` DATETIME(3) NOT NULL,
    `last_activity_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_sessions_session_token_key`(`session_token`),
    UNIQUE INDEX `user_sessions_refresh_token_key`(`refresh_token`),
    INDEX `user_sessions_user_id_idx`(`user_id`),
    INDEX `user_sessions_session_token_idx`(`session_token`),
    INDEX `user_sessions_refresh_token_idx`(`refresh_token`),
    INDEX `user_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Web Push Subscriptions
CREATE TABLE `web_push_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `endpoint` TEXT NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `user_agent` TEXT NULL,
    `device_name` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `web_push_subscriptions_user_id_idx`(`user_id`),
    INDEX `web_push_subscriptions_is_active_idx`(`is_active`),
    UNIQUE INDEX `web_push_subscriptions_user_id_endpoint_key`(`user_id`, `endpoint`(500)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Unified Notification Templates
CREATE TABLE `notification_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_type` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `subject` VARCHAR(255) NULL,
    `body` TEXT NOT NULL,
    `body_html` TEXT NULL,
    `icon_url` VARCHAR(500) NULL,
    `action_url` VARCHAR(500) NULL,
    `variables_json` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_templates_template_type_channel_key`(`template_type`, `channel`),
    INDEX `notification_templates_template_type_channel_idx`(`template_type`, `channel`),
    INDEX `notification_templates_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Web Push Notification Logs
CREATE TABLE `web_push_notification_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_type` VARCHAR(50) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `subscription_id` INTEGER NULL,
    `title` VARCHAR(255) NULL,
    `body` TEXT NULL,
    `status` VARCHAR(20) NOT NULL,
    `error_message` TEXT NULL,
    `webhook_event_id` INTEGER NULL,
    `position_id` INTEGER NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `web_push_notification_logs_template_type_idx`(`template_type`),
    INDEX `web_push_notification_logs_user_id_idx`(`user_id`),
    INDEX `web_push_notification_logs_status_idx`(`status`),
    INDEX `web_push_notification_logs_sent_at_idx`(`sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `passkeys` ADD CONSTRAINT `passkeys_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `web_push_subscriptions` ADD CONSTRAINT `web_push_subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

