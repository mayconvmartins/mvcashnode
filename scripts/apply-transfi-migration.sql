-- Migration para adicionar suporte TransFi
-- Execute este script diretamente no banco de dados se a migration não foi aplicada automaticamente

-- Criar tabela transfi_config
CREATE TABLE IF NOT EXISTS `transfi_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `merchant_id` VARCHAR(255) NOT NULL,
    `authorization_token_enc` TEXT NOT NULL,
    `environment` VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    `webhook_url` VARCHAR(500) NULL,
    `webhook_secret_enc` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Criar tabela transfi_webhook_events
CREATE TABLE IF NOT EXISTS `transfi_webhook_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transfi_event_id` VARCHAR(255) NOT NULL,
    `transfi_event_type` VARCHAR(50) NOT NULL,
    `transfi_resource_id` VARCHAR(255) NOT NULL,
    `raw_payload_json` JSON NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `processed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `transfi_webhook_events_transfi_event_id_key` (`transfi_event_id`),
    KEY `transfi_webhook_events_transfi_resource_id_idx` (`transfi_resource_id`),
    KEY `transfi_webhook_events_processed_idx` (`processed`),
    KEY `transfi_webhook_events_created_at_idx` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Alterar mp_payment_id para permitir NULL
ALTER TABLE `subscription_payments` MODIFY `mp_payment_id` VARCHAR(255) NULL;

-- Adicionar colunas TransFi (verificar se não existem antes)
SET @dbname = DATABASE();
SET @tablename = 'subscription_payments';
SET @columnname1 = 'transfi_payment_id';
SET @columnname2 = 'transfi_order_id';

SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname1)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname1, '` VARCHAR(255) NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname2)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname2, '` VARCHAR(255) NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Criar índices se não existirem
CREATE INDEX IF NOT EXISTS `subscription_payments_transfi_payment_id_idx` ON `subscription_payments`(`transfi_payment_id`);
CREATE INDEX IF NOT EXISTS `subscription_payments_transfi_order_id_idx` ON `subscription_payments`(`transfi_order_id`);

-- Alterar subscription_webhook_events para permitir NULL nos campos MP
ALTER TABLE `subscription_webhook_events` 
    MODIFY `mp_event_id` VARCHAR(255) NULL,
    MODIFY `mp_event_type` VARCHAR(50) NULL,
    MODIFY `mp_resource_id` VARCHAR(255) NULL;
