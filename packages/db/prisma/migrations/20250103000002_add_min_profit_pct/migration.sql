-- AlterTable
-- Verificar se a tabela existe e se a coluna não existe antes de adicionar
SET @table_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'trade_parameters'
);

SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'trade_parameters'
    AND COLUMN_NAME = 'min_profit_pct'
);

SET @sql = IF(@table_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `trade_parameters` ADD COLUMN `min_profit_pct` DECIMAL(5, 2) NULL',
  'SELECT "Table does not exist or column already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

