-- Corrigir problema com authorization_token_enc que ainda existe no banco
-- Esta migração garante que a coluna authorization_token_enc seja removida se ainda existir

-- Verificar se a coluna authorization_token_enc existe
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'transfi_config' 
    AND COLUMN_NAME = 'authorization_token_enc'
);

-- Verificar se username existe (indica que a migração anterior foi aplicada)
SET @username_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'transfi_config' 
    AND COLUMN_NAME = 'username'
);

-- Se authorization_token_enc existe e username também existe, remover authorization_token_enc
SET @sql = IF(@col_exists > 0 AND @username_exists > 0,
  'ALTER TABLE `transfi_config` DROP COLUMN `authorization_token_enc`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Se authorization_token_enc existe mas username não existe, adicionar username e password_enc primeiro
SET @sql = IF(@col_exists > 0 AND @username_exists = 0,
  'ALTER TABLE `transfi_config` ADD COLUMN `username` VARCHAR(255) NOT NULL DEFAULT "" AFTER `merchant_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @password_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'transfi_config' 
    AND COLUMN_NAME = 'password_enc'
);

SET @sql = IF(@password_exists = 0,
  'ALTER TABLE `transfi_config` ADD COLUMN `password_enc` TEXT NOT NULL DEFAULT "" AFTER `username`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @redirect_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'transfi_config' 
    AND COLUMN_NAME = 'redirect_url'
);

SET @sql = IF(@redirect_exists = 0,
  'ALTER TABLE `transfi_config` ADD COLUMN `redirect_url` VARCHAR(500) NULL AFTER `webhook_url`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migrar dados de authorization_token_enc para password_enc se necessário
SET @sql = IF(@col_exists > 0 AND @password_exists > 0,
  'UPDATE `transfi_config` SET `password_enc` = `authorization_token_enc` WHERE (`password_enc` = "" OR `password_enc` IS NULL) AND `authorization_token_enc` IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Remover authorization_token_enc se ainda existir
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE `transfi_config` DROP COLUMN `authorization_token_enc`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
