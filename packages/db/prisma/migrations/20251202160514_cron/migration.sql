-- CreateTable
CREATE TABLE `cron_job_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `queue_name` VARCHAR(100) NOT NULL,
    `job_id` VARCHAR(100) NOT NULL,
    `interval_ms` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `timeout_ms` INTEGER NULL,
    `max_retries` INTEGER NOT NULL DEFAULT 3,
    `config_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `cron_job_configs_name_key`(`name`),
    INDEX `cron_job_configs_name_idx`(`name`),
    INDEX `cron_job_configs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cron_job_executions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_config_id` INTEGER NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,
    `duration_ms` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL,
    `result_json` JSON NULL,
    `error_message` TEXT NULL,
    `triggered_by` VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',

    INDEX `cron_job_executions_job_config_id_started_at_idx`(`job_config_id`, `started_at`),
    INDEX `cron_job_executions_started_at_idx`(`started_at`),
    INDEX `cron_job_executions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cron_job_executions` ADD CONSTRAINT `cron_job_executions_job_config_id_fkey` FOREIGN KEY (`job_config_id`) REFERENCES `cron_job_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
