-- Script para adicionar a coluna min_profit_pct manualmente
-- Execute este script diretamente no banco de dados se a migration falhar

-- Verificar se a coluna já existe antes de adicionar
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'trade_parameters' 
    AND COLUMN_NAME = 'min_profit_pct'
);

SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `trade_parameters` ADD COLUMN `min_profit_pct` DECIMAL(5, 2) NULL',
  'SELECT "Column min_profit_pct already exists" AS message');
  
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

