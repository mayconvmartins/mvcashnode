-- AlterTable
ALTER TABLE `trade_positions` ADD COLUMN `is_dust` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `dust_value_usd` DECIMAL(36, 18) NULL,
    ADD COLUMN `original_position_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `trade_positions_is_dust_idx` ON `trade_positions`(`is_dust`);

-- CreateIndex
CREATE INDEX `trade_positions_original_position_id_idx` ON `trade_positions`(`original_position_id`);

-- AddForeignKey
ALTER TABLE `trade_positions` ADD CONSTRAINT `trade_positions_original_position_id_fkey` FOREIGN KEY (`original_position_id`) REFERENCES `trade_positions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
