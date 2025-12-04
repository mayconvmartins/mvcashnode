-- AlterTable
ALTER TABLE `trade_parameters` ADD COLUMN `min_profit_pct` DECIMAL(5, 2) NULL;

-- CreateIndex
CREATE INDEX `exchange_accounts_user_id_id_idx` ON `exchange_accounts`(`user_id`, `id`);
