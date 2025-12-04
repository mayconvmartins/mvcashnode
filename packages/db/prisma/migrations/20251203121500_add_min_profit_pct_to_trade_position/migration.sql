-- AlterTable
-- Verificar se a coluna já existe antes de adicionar
SET @col_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'trade_positions'
    AND COLUMN_NAME = 'min_profit_pct'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `trade_positions` ADD COLUMN `min_profit_pct` DECIMAL(5, 2) NULL',
  'SELECT "Column min_profit_pct already exists in trade_positions" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

