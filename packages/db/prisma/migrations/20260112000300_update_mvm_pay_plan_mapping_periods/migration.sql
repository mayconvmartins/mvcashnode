-- AlterTable
ALTER TABLE `subscription_plans`
  DROP COLUMN `mvm_pay_plan_id`,
  ADD COLUMN `mvm_pay_plan_id_monthly` INTEGER NULL,
  ADD COLUMN `mvm_pay_plan_id_quarterly` INTEGER NULL;

-- Indexes
CREATE INDEX `subscription_plans_mvm_pay_plan_id_monthly_idx` ON `subscription_plans`(`mvm_pay_plan_id_monthly`);
CREATE INDEX `subscription_plans_mvm_pay_plan_id_quarterly_idx` ON `subscription_plans`(`mvm_pay_plan_id_quarterly`);

