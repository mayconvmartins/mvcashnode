-- Adicionar campos para monitoramento SELL e detalhes de execução
ALTER TABLE `webhook_monitor_alerts` 
  ADD COLUMN `side` VARCHAR(10) NOT NULL DEFAULT 'BUY' AFTER `trade_mode`,
  ADD COLUMN `price_maximum` DECIMAL(36, 18) NULL AFTER `price_minimum`,
  ADD COLUMN `execution_price` DECIMAL(36, 18) NULL AFTER `current_price`,
  ADD COLUMN `cycles_without_new_high` INT NOT NULL DEFAULT 0 AFTER `cycles_without_new_low`,
  ADD COLUMN `executed_trade_job_ids_json` JSON NULL AFTER `executed_trade_job_id`,
  ADD COLUMN `exit_details` TEXT NULL AFTER `exit_reason`;

-- Tornar price_minimum nullable (já que SELL não usa)
ALTER TABLE `webhook_monitor_alerts` 
  MODIFY COLUMN `price_minimum` DECIMAL(36, 18) NULL;

-- Adicionar índice para side
CREATE INDEX `webhook_monitor_alerts_side_idx` ON `webhook_monitor_alerts`(`side`);

-- Adicionar parâmetros SELL ao WebhookMonitorConfig
ALTER TABLE `webhook_monitor_config`
  ADD COLUMN `sell_lateral_tolerance_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0.30 AFTER `cooldown_after_execution_min`,
  ADD COLUMN `sell_lateral_cycles_min` INT NOT NULL DEFAULT 4 AFTER `sell_lateral_tolerance_pct`,
  ADD COLUMN `sell_fall_trigger_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0.50 AFTER `sell_lateral_cycles_min`,
  ADD COLUMN `sell_fall_cycles_min` INT NOT NULL DEFAULT 2 AFTER `sell_fall_trigger_pct`,
  ADD COLUMN `sell_max_rise_pct` DECIMAL(5, 2) NOT NULL DEFAULT 6.00 AFTER `sell_fall_cycles_min`,
  ADD COLUMN `sell_max_monitoring_time_min` INT NOT NULL DEFAULT 60 AFTER `sell_max_rise_pct`,
  ADD COLUMN `sell_cooldown_after_execution_min` INT NOT NULL DEFAULT 30 AFTER `sell_max_monitoring_time_min`;

