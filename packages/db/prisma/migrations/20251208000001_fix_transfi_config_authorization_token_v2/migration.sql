-- Corrigir problema com authorization_token_enc que ainda existe no banco
-- Versão 2: Esta migração garante que a coluna authorization_token_enc seja removida se ainda existir

-- Verificar se a coluna authorization_token_enc existe
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'transfi_config' 
    AND COLUMN_NAME = 'authorization_token_enc'
);

-- Se a coluna não existe, não fazer nada
-- Se existe, remover diretamente (dados já devem ter sido migrados)
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE `transfi_config` DROP COLUMN `authorization_token_enc`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
