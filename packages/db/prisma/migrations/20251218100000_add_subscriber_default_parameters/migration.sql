-- CreateTable: Parametros padrao globais para assinantes
CREATE TABLE IF NOT EXISTS `subscriber_default_parameters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `min_quote_amount` DECIMAL(36, 18) NOT NULL DEFAULT 20,
    `max_quote_amount` DECIMAL(36, 18) NULL,
    `default_quote_amount` DECIMAL(36, 18) NOT NULL DEFAULT 100,
    `default_sl_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_sl_pct` DECIMAL(5, 2) NULL,
    `default_tp_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_tp_pct` DECIMAL(5, 2) NULL,
    `default_sg_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_sg_pct` DECIMAL(5, 2) NULL,
    `default_sg_drop_pct` DECIMAL(5, 2) NULL,
    `default_tsg_enabled` BOOLEAN NOT NULL DEFAULT false,
    `default_tsg_activation_pct` DECIMAL(5, 2) NULL,
    `default_tsg_drop_pct` DECIMAL(5, 2) NULL,
    `min_profit_pct` DECIMAL(5, 2) NULL,
    `lock_webhook_on_tsg` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddColumn: Valor escolhido pelo assinante em subscriber_parameters
ALTER TABLE `subscriber_parameters` ADD COLUMN IF NOT EXISTS `quote_amount_fixed` DECIMAL(36, 18) NULL;

-- Insert default record
INSERT INTO `subscriber_default_parameters` (
    `min_quote_amount`,
    `max_quote_amount`,
    `default_quote_amount`,
    `default_sl_enabled`,
    `default_tp_enabled`,
    `default_sg_enabled`,
    `default_tsg_enabled`,
    `lock_webhook_on_tsg`,
    `updated_at`
) VALUES (
    20,
    NULL,
    100,
    false,
    false,
    false,
    false,
    true,
    NOW()
) ON DUPLICATE KEY UPDATE `id` = `id`;

