-- CreateTable
CREATE TABLE `crypto_symbols` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `symbol` VARCHAR(20) NOT NULL,
    `coingecko_id` VARCHAR(100) NULL,
    `name` VARCHAR(255) NULL,
    `logo_url` VARCHAR(500) NULL,
    `logo_local_path` VARCHAR(500) NULL,
    `last_updated` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `crypto_symbols_symbol_key`(`symbol`),
    INDEX `crypto_symbols_symbol_idx`(`symbol`),
    INDEX `crypto_symbols_coingecko_id_idx`(`coingecko_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

