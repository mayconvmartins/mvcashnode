-- CreateTable
CREATE TABLE IF NOT EXISTS `passkey_challenges` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `challenge_key` VARCHAR(255) NOT NULL,
    `challenge` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `passkey_challenges_challenge_key_key`(`challenge_key`),
    INDEX `passkey_challenges_challenge_key_idx`(`challenge_key`),
    INDEX `passkey_challenges_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

