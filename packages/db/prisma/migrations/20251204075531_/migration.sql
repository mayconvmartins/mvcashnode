-- AlterTable (com verificação se a coluna já existe)
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'trade_parameters'
    AND COLUMN_NAME = 'min_profit_pct'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `trade_parameters` ADD COLUMN `min_profit_pct` DECIMAL(5, 2) NULL',
    'SELECT "Column min_profit_pct already exists in trade_parameters" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- CreateIndex (com verificação se o índice já existe)
SET @idx_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exchange_accounts'
    AND INDEX_NAME = 'exchange_accounts_user_id_id_idx'
);

SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX `exchange_accounts_user_id_id_idx` ON `exchange_accounts`(`user_id`, `id`)',
    'SELECT "Index exchange_accounts_user_id_id_idx already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
