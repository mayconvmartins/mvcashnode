-- AlterTable
ALTER TABLE `trade_positions` ADD COLUMN `sg_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sg_pct` DECIMAL(5, 2) NULL,
    ADD COLUMN `sg_triggered` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `trade_parameters` ADD COLUMN `default_sg_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `default_sg_pct` DECIMAL(5, 2) NULL;

