-- AlterTable
ALTER TABLE `trade_jobs` ADD COLUMN `created_by` VARCHAR(50) NULL COMMENT 'Quem ou qual serviço criou a ordem (USER_MANUAL, WEBHOOK, SLTP_MONITOR, etc.)' AFTER `position_id_to_close`;

