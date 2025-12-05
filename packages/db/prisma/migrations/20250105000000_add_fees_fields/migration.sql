-- AlterTable
ALTER TABLE `trade_executions` ADD COLUMN `fee_amount` DECIMAL(36, 18) NULL,
    ADD COLUMN `fee_currency` VARCHAR(20) NULL,
    ADD COLUMN `fee_rate` DECIMAL(10, 8) NULL;

-- AlterTable
ALTER TABLE `trade_positions` ADD COLUMN `total_fees_paid_usd` DECIMAL(36, 18) NOT NULL DEFAULT 0,
    ADD COLUMN `fees_on_buy_usd` DECIMAL(36, 18) NOT NULL DEFAULT 0,
    ADD COLUMN `fees_on_sell_usd` DECIMAL(36, 18) NOT NULL DEFAULT 0;
