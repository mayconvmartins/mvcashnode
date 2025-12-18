-- AlterTable trade_positions: Adicionar campos de Trailing Stop Gain
ALTER TABLE `trade_positions` 
  ADD COLUMN `tsg_enabled` BOOLEAN NOT NULL DEFAULT false AFTER `sg_triggered`,
  ADD COLUMN `tsg_activation_pct` DECIMAL(5, 2) NULL AFTER `tsg_enabled`,
  ADD COLUMN `tsg_drop_pct` DECIMAL(5, 2) NULL AFTER `tsg_activation_pct`,
  ADD COLUMN `tsg_activated` BOOLEAN NOT NULL DEFAULT false AFTER `tsg_drop_pct`,
  ADD COLUMN `tsg_max_pnl_pct` DECIMAL(5, 2) NULL AFTER `tsg_activated`,
  ADD COLUMN `tsg_triggered` BOOLEAN NOT NULL DEFAULT false AFTER `tsg_max_pnl_pct`;

-- AlterTable trade_parameters: Adicionar campos padrão de Trailing Stop Gain
ALTER TABLE `trade_parameters`
  ADD COLUMN `default_tsg_enabled` BOOLEAN NOT NULL DEFAULT false AFTER `default_sg_drop_pct`,
  ADD COLUMN `default_tsg_activation_pct` DECIMAL(5, 2) NULL AFTER `default_tsg_enabled`,
  ADD COLUMN `default_tsg_drop_pct` DECIMAL(5, 2) NULL AFTER `default_tsg_activation_pct`;

