-- AlterTable
ALTER TABLE `exchange_accounts` ADD COLUMN `fee_rate_buy_limit` DECIMAL(10, 8) NULL,
    ADD COLUMN `fee_rate_buy_market` DECIMAL(10, 8) NULL,
    ADD COLUMN `fee_rate_sell_limit` DECIMAL(10, 8) NULL,
    ADD COLUMN `fee_rate_sell_market` DECIMAL(10, 8) NULL;
