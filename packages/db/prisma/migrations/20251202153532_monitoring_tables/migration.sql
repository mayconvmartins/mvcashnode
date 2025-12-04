-- CreateTable
CREATE TABLE `system_monitoring_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `service_name` VARCHAR(50) NOT NULL,
    `process_id` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL,
    `cpu_usage` DECIMAL(5, 2) NULL,
    `memory_usage` DECIMAL(10, 2) NULL,
    `metrics_json` JSON NULL,

    INDEX `system_monitoring_logs_service_name_timestamp_idx`(`service_name`, `timestamp`),
    INDEX `system_monitoring_logs_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alert_type` VARCHAR(50) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `message` TEXT NOT NULL,
    `service_name` VARCHAR(50) NULL,
    `metadata_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `resolved_by` INTEGER NULL,

    INDEX `system_alerts_alert_type_severity_idx`(`alert_type`, `severity`),
    INDEX `system_alerts_created_at_idx`(`created_at`),
    INDEX `system_alerts_resolved_at_idx`(`resolved_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
