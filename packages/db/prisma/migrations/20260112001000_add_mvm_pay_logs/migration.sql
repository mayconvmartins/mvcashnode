-- CreateTable
CREATE TABLE `mvm_pay_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `level` VARCHAR(10) NOT NULL DEFAULT 'INFO',
  `source` VARCHAR(20) NOT NULL,
  `action` VARCHAR(50) NULL,
  `method` VARCHAR(10) NULL,
  `path` VARCHAR(255) NULL,
  `status_code` INTEGER NULL,
  `duration_ms` INTEGER NULL,
  `email` VARCHAR(255) NULL,
  `request_json` JSON NULL,
  `response_json` JSON NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `mvm_pay_logs_created_at_idx`(`created_at`),
  INDEX `mvm_pay_logs_level_idx`(`level`),
  INDEX `mvm_pay_logs_source_idx`(`source`),
  INDEX `mvm_pay_logs_path_idx`(`path`),
  INDEX `mvm_pay_logs_status_code_idx`(`status_code`),
  INDEX `mvm_pay_logs_email_idx`(`email`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

