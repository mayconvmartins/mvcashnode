-- AlterTable
ALTER TABLE `subscriptions`
  ADD COLUMN `origin_provider` VARCHAR(20) NOT NULL DEFAULT 'native';

-- Backfill: assinaturas vindas do MvM Pay (histórico)
UPDATE `subscriptions`
SET `origin_provider` = 'mvm_pay'
WHERE `payment_method` = 'MVM_PAY';

-- CreateIndex
CREATE INDEX `subscriptions_origin_provider_idx` ON `subscriptions`(`origin_provider`);

