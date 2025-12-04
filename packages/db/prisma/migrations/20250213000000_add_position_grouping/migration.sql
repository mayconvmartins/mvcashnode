-- AlterTable
ALTER TABLE `trade_parameters` ADD COLUMN `group_positions_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `group_positions_interval_minutes` INTEGER NULL;

-- AlterTable
ALTER TABLE `trade_positions` ADD COLUMN `is_grouped` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `group_started_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `position_grouped_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `trade_job_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `position_grouped_jobs_position_id_trade_job_id_key`(`position_id`, `trade_job_id`),
    INDEX `position_grouped_jobs_position_id_idx`(`position_id`),
    INDEX `position_grouped_jobs_trade_job_id_idx`(`trade_job_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `trade_positions_grouping_idx` ON `trade_positions`(`exchange_account_id`, `trade_mode`, `symbol`, `status`, `is_grouped`, `created_at`);

-- AddForeignKey
ALTER TABLE `position_grouped_jobs` ADD CONSTRAINT `position_grouped_jobs_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `trade_positions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `position_grouped_jobs` ADD CONSTRAINT `position_grouped_jobs_trade_job_id_fkey` FOREIGN KEY (`trade_job_id`) REFERENCES `trade_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
