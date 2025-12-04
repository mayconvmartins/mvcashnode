-- CreateTable
CREATE TABLE `whatsapp_notification_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_type` VARCHAR(50) NOT NULL,
    `recipient` VARCHAR(255) NOT NULL,
    `recipient_type` VARCHAR(20) NOT NULL,
    `message` TEXT NULL,
    `status` VARCHAR(20) NOT NULL,
    `error_message` TEXT NULL,
    `webhook_event_id` INTEGER NULL,
    `position_id` INTEGER NULL,
    `vault_id` INTEGER NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `whatsapp_notification_logs_template_type_idx`(`template_type`),
    INDEX `whatsapp_notification_logs_recipient_idx`(`recipient`),
    INDEX `whatsapp_notification_logs_sent_at_idx`(`sent_at`),
    INDEX `whatsapp_notification_logs_status_idx`(`status`),
    INDEX `whatsapp_notification_logs_webhook_event_id_idx`(`webhook_event_id`),
    INDEX `whatsapp_notification_logs_position_id_idx`(`position_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

