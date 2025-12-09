-- Adicionar novos campos
ALTER TABLE `webhook_monitor_alerts` 
  ADD COLUMN `monitoring_status` VARCHAR(20) NULL,
  ADD COLUMN `exit_reason` VARCHAR(100) NULL;

-- Remover foreign key constraint primeiro (ela usa o índice)
ALTER TABLE `webhook_monitor_alerts` 
  DROP FOREIGN KEY `webhook_monitor_alerts_exchange_account_id_fkey`;

-- Remover índice antigo
DROP INDEX `wh_monitor_alerts_active_idx` ON `webhook_monitor_alerts`;

-- Tornar exchange_account_id opcional (nullable)
ALTER TABLE `webhook_monitor_alerts` 
  MODIFY COLUMN `exchange_account_id` INTEGER NULL;

-- Criar novo índice por webhook_source_id + symbol + trade_mode + state
CREATE INDEX `wh_monitor_alerts_active_idx` ON `webhook_monitor_alerts`(`webhook_source_id`, `symbol`, `trade_mode`, `state`);

-- Recriar foreign key constraint (agora permitindo NULL)
ALTER TABLE `webhook_monitor_alerts` 
  ADD CONSTRAINT `webhook_monitor_alerts_exchange_account_id_fkey` 
  FOREIGN KEY (`exchange_account_id`) 
  REFERENCES `exchange_accounts`(`id`) 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;

-- Migração de dados: Consolidar alertas duplicados
-- Para cada combinação de (webhook_source_id, symbol, trade_mode) com múltiplos alertas MONITORING,
-- manter apenas o mais recente (ou o com menor preço) e cancelar os demais
UPDATE `webhook_monitor_alerts` wma1
INNER JOIN (
  SELECT 
    wma2.webhook_source_id,
    wma2.symbol,
    wma2.trade_mode,
    MIN(wma2.id) as keep_id,
    MIN(wma2.price_minimum) as min_price
  FROM `webhook_monitor_alerts` wma2
  WHERE wma2.state = 'MONITORING'
  GROUP BY wma2.webhook_source_id, wma2.symbol, wma2.trade_mode
  HAVING COUNT(*) > 1
) duplicates ON 
  wma1.webhook_source_id = duplicates.webhook_source_id
  AND wma1.symbol = duplicates.symbol
  AND wma1.trade_mode = duplicates.trade_mode
  AND wma1.state = 'MONITORING'
  AND wma1.id != duplicates.keep_id
SET 
  wma1.state = 'CANCELLED',
  wma1.cancel_reason = CONCAT('Migração: consolidado em alerta único (ID ', duplicates.keep_id, ')'),
  wma1.exit_reason = 'REPLACED',
  wma1.updated_at = NOW();

