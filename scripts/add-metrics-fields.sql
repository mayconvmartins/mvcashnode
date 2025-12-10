-- Adicionar campos de métricas ao WebhookMonitorAlert se não existirem
ALTER TABLE `webhook_monitor_alerts` 
ADD COLUMN IF NOT EXISTS `monitoring_duration_minutes` INT NULL COMMENT 'Tempo total em monitoramento (minutos)',
ADD COLUMN IF NOT EXISTS `savings_pct` DECIMAL(10, 4) NULL COMMENT '% economia vs preço alerta inicial',
ADD COLUMN IF NOT EXISTS `efficiency_pct` DECIMAL(10, 4) NULL COMMENT '% proximidade do melhor preço (min/max)';

