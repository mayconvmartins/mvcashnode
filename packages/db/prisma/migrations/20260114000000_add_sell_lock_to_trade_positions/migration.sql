-- Add sell lock fields to trade_positions (sequential SELL protection)
ALTER TABLE `trade_positions`
  ADD COLUMN `sell_lock_job_id` INT NULL AFTER `lock_sell_by_webhook`,
  ADD COLUMN `sell_lock_expires_at` DATETIME(3) NULL AFTER `sell_lock_job_id`;

CREATE INDEX `trade_positions_sell_lock_idx`
  ON `trade_positions` (`sell_lock_job_id`, `sell_lock_expires_at`);

