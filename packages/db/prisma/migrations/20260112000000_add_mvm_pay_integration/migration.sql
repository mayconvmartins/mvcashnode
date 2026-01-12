-- CreateTable
CREATE TABLE `mvm_pay_config` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `base_url` VARCHAR(500) NOT NULL,
  `checkout_url` VARCHAR(500) NOT NULL,
  `api_key` VARCHAR(255) NOT NULL,
  `api_secret_enc` TEXT NOT NULL,
  `product_id` INT NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX `mvm_pay_config_is_active_idx`(`is_active`),
  INDEX `mvm_pay_config_product_id_idx`(`product_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `subscription_plans`
  ADD COLUMN `mvm_pay_plan_id` INT NULL;

-- CreateIndex
CREATE INDEX `subscription_plans_mvm_pay_plan_id_idx` ON `subscription_plans`(`mvm_pay_plan_id`);

