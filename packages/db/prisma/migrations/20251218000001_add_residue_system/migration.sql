-- AlterTable: Adicionar colunas de resíduo em trade_positions
ALTER TABLE `trade_positions` 
ADD COLUMN `is_residue_position` BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN `parent_position_id` INT NULL;

-- CreateIndex: Índice para is_residue_position
CREATE INDEX `idx_trade_positions_is_residue` ON `trade_positions`(`is_residue_position`);

-- AddForeignKey: Foreign key para parent_position_id
ALTER TABLE `trade_positions` 
ADD CONSTRAINT `fk_parent_position` 
FOREIGN KEY (`parent_position_id`) REFERENCES `trade_positions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: Tabela residue_transfer_jobs
CREATE TABLE `residue_transfer_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_position_id` INTEGER NOT NULL,
    `target_position_id` INTEGER NULL,
    `symbol` VARCHAR(50) NOT NULL,
    `qty_transferred` DECIMAL(36, 18) NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `reason_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    INDEX `idx_residue_jobs_status` (`status`),
    INDEX `idx_residue_jobs_source` (`source_position_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: Foreign key para source_position_id
ALTER TABLE `residue_transfer_jobs` 
ADD CONSTRAINT `fk_residue_source_position` 
FOREIGN KEY (`source_position_id`) REFERENCES `trade_positions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Foreign key para target_position_id
ALTER TABLE `residue_transfer_jobs` 
ADD CONSTRAINT `fk_residue_target_position` 
FOREIGN KEY (`target_position_id`) REFERENCES `trade_positions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

