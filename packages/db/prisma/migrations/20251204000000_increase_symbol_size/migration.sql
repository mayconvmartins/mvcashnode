-- AlterTable: Increase symbol column size from VARCHAR(50) to VARCHAR(200)
-- This allows storing multiple symbols separated by commas (e.g., "SOLUSDT,BTCUSDT,LTCUSDT,...")
ALTER TABLE `trade_parameters` MODIFY COLUMN `symbol` VARCHAR(200) NOT NULL;

