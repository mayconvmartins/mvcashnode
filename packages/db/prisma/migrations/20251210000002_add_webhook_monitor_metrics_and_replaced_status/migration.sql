-- AlterTable: Adicionar campos de métricas ao WebhookMonitorAlert
ALTER TABLE `webhook_monitor_alerts` 
ADD COLUMN `monitoring_duration_minutes` INT NULL COMMENT 'Tempo total em monitoramento (minutos)',
ADD COLUMN `savings_pct` DECIMAL(10, 4) NULL COMMENT '% economia vs preço alerta inicial',
ADD COLUMN `efficiency_pct` DECIMAL(10, 4) NULL COMMENT '% proximidade do melhor preço (min/max)';

-- Comentário no schema: webhook_events.status agora suporta 'REPLACED'
-- Status possíveis: 'RECEIVED' | 'MONITORING' | 'JOB_CREATED' | 'SKIPPED' | 'FAILED' | 'REPLACED'

