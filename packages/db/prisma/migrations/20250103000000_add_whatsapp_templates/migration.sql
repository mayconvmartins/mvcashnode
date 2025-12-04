-- CreateTable
CREATE TABLE `whatsapp_notification_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_type` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(255) NULL,
    `body` TEXT NOT NULL,
    `variables_json` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `whatsapp_notification_templates_template_type_is_active_idx`(`template_type`, `is_active`),
    INDEX `whatsapp_notification_templates_template_type_idx`(`template_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
