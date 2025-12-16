-- CreateTable: webhook_monitor_snapshots
-- Tabela para armazenar timeline/histórico detalhado do monitoramento de alertas
CREATE TABLE `webhook_monitor_snapshots` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `alert_id` INT NOT NULL,
  `event_type` VARCHAR(50) NOT NULL COMMENT 'CREATED | PRICE_CHECK | STATUS_CHANGE | REPLACED | EXECUTED | CANCELLED',
  `monitoring_status` VARCHAR(20) NULL COMMENT 'FALLING | LATERAL | RISING',
  `current_price` DECIMAL(36, 18) NULL,
  `price_minimum` DECIMAL(36, 18) NULL COMMENT 'Para BUY: menor preço visto',
  `price_maximum` DECIMAL(36, 18) NULL COMMENT 'Para SELL: maior preço visto',
  `cycles_without_new_low` INT NULL COMMENT 'Para BUY: ciclos sem novo fundo',
  `cycles_without_new_high` INT NULL COMMENT 'Para SELL: ciclos sem novo topo',
  `details` JSON NULL COMMENT 'Dados extras: replaced_by_alert_id, cancel_reason, etc',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `webhook_monitor_snapshots_alert_id_created_at_idx` (`alert_id`, `created_at`),
  CONSTRAINT `webhook_monitor_snapshots_alert_id_fkey` 
    FOREIGN KEY (`alert_id`) REFERENCES `webhook_monitor_alerts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

