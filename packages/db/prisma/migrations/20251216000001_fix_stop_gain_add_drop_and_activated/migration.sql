-- AlterTable
ALTER TABLE `trade_positions` 
  ADD COLUMN `sg_drop_pct` DECIMAL(5, 2) NULL AFTER `sg_pct`,
  ADD COLUMN `sg_activated` BOOLEAN NOT NULL DEFAULT false AFTER `sg_drop_pct`;

-- AlterTable
ALTER TABLE `trade_parameters`
  ADD COLUMN `default_sg_drop_pct` DECIMAL(5, 2) NULL AFTER `default_sg_pct`;

