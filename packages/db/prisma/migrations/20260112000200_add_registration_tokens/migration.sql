-- CreateTable
CREATE TABLE `registration_tokens` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `purpose` VARCHAR(50) NOT NULL DEFAULT 'MVM_PAY_ACTIVATION',
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `registration_tokens_token_hash_key`(`token_hash`),
  INDEX `registration_tokens_email_idx`(`email`),
  INDEX `registration_tokens_purpose_idx`(`purpose`),
  INDEX `registration_tokens_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

