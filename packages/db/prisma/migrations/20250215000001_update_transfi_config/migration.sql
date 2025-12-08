-- Atualizar tabela transfi_config para usar username/password ao invés de authorization_token
-- e adicionar redirect_url

-- Verificar se a coluna authorization_token_enc existe e renomear/migrar dados se necessário
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'transfi_config' 
    AND COLUMN_NAME = 'authorization_token_enc'
);

-- Se authorization_token_enc existe mas username não existe, adicionar username e password_enc
SET @username_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'transfi_config' 
    AND COLUMN_NAME = 'username'
);

-- Adicionar colunas se não existirem
SET @sql = IF(@username_exists = 0, 
  'ALTER TABLE `transfi_config` 
    ADD COLUMN `username` VARCHAR(255) NOT NULL DEFAULT "" AFTER `merchant_id`,
    ADD COLUMN `password_enc` TEXT NOT NULL DEFAULT "" AFTER `username`,
    ADD COLUMN `redirect_url` VARCHAR(500) NULL AFTER `webhook_url`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Se authorization_token_enc existe, migrar dados para password_enc
SET @sql = IF(@col_exists > 0 AND @username_exists = 0,
  'UPDATE `transfi_config` SET `password_enc` = `authorization_token_enc` WHERE `password_enc` = ""',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Remover coluna authorization_token_enc se existir e username já foi criado
SET @sql = IF(@col_exists > 0 AND @username_exists > 0,
  'ALTER TABLE `transfi_config` DROP COLUMN `authorization_token_enc`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Criar tabela system_settings se não existir
CREATE TABLE IF NOT EXISTS `system_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    `description` VARCHAR(255) NULL,
    `category` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `system_settings_key_key`(`key`),
    INDEX `system_settings_key_idx`(`key`),
    INDEX `system_settings_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Inserir configuração padrão de gateway
INSERT INTO `system_settings` (`key`, `value`, `description`, `category`) 
VALUES ('payment_gateway', 'mercadopago', 'Gateway de pagamento padrão (mercadopago ou transfi)', 'payment')
ON DUPLICATE KEY UPDATE `value` = `value`;
