-- Melhorias no Webhook Monitor
-- 1. Adicionar campos de preço original e primeiro alerta para cálculo correto de métricas
-- 2. Adicionar rastreabilidade de cadeia de substituições
-- 3. Tornar limites opcionais (enabled/disabled)

-- Novos campos na tabela webhook_monitor_alerts
ALTER TABLE `webhook_monitor_alerts`
ADD COLUMN `price_original` DECIMAL(36, 18) NULL AFTER `price_alert`,
ADD COLUMN `price_first_alert` DECIMAL(36, 18) NULL AFTER `price_original`,
ADD COLUMN `replaced_alert_id` INT NULL AFTER `efficiency_pct`,
ADD COLUMN `replacement_count` INT NOT NULL DEFAULT 0 AFTER `replaced_alert_id`;

-- Índice para rastreabilidade de cadeia
CREATE INDEX `webhook_monitor_alerts_replaced_alert_id_idx` ON `webhook_monitor_alerts`(`replaced_alert_id`);

-- Novos campos de enabled/disabled na tabela webhook_monitor_config para BUY
ALTER TABLE `webhook_monitor_config`
ADD COLUMN `lateral_cycles_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `lateral_cycles_min`,
ADD COLUMN `rise_cycles_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `rise_cycles_min`,
ADD COLUMN `max_fall_enabled` BOOLEAN NOT NULL DEFAULT false AFTER `max_fall_pct`,
ADD COLUMN `max_monitoring_time_enabled` BOOLEAN NOT NULL DEFAULT false AFTER `max_monitoring_time_min`;

-- Novos campos de enabled/disabled na tabela webhook_monitor_config para SELL
ALTER TABLE `webhook_monitor_config`
ADD COLUMN `sell_lateral_cycles_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `sell_lateral_cycles_min`,
ADD COLUMN `sell_fall_cycles_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `sell_fall_cycles_min`,
ADD COLUMN `sell_max_monitoring_time_enabled` BOOLEAN NOT NULL DEFAULT false AFTER `sell_max_monitoring_time_min`;

-- Inicializar price_original e price_first_alert com price_alert para alertas existentes
UPDATE `webhook_monitor_alerts` 
SET `price_original` = `price_alert`,
    `price_first_alert` = `price_alert`
WHERE `price_original` IS NULL;

