-- AlterTable
ALTER TABLE `subscriptions`
  ADD COLUMN `external_subscription_id` VARCHAR(64) NULL;

-- Backfill (melhor esforço): se já marcou como mvm_pay e tiver mp_payment_id/mp_preference_id não usamos.
-- Aqui não há coluna histórica com subscription_id do MvM Pay, então o preenchimento real virá do sync/completeRegistration.

-- CreateIndex
CREATE INDEX `subscriptions_external_subscription_id_idx`
  ON `subscriptions`(`external_subscription_id`);

