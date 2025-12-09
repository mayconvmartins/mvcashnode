-- Script para verificar e corrigir a migration falhada de refatoração do webhook monitor
-- Execute este SQL diretamente no banco MySQL

-- 1. Verificar o estado atual da migration
SELECT 
    migration_name,
    finished_at,
    applied_steps_count,
    logs
FROM `_prisma_migrations` 
WHERE migration_name = '20251210000000_refactor_webhook_monitor_one_per_webhook';

-- 2. Verificar se os novos campos já existem
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_monitor_alerts'
  AND COLUMN_NAME IN ('monitoring_status', 'exit_reason');

-- 3. Verificar se exchange_account_id é nullable
SELECT 
    COLUMN_NAME,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_monitor_alerts'
  AND COLUMN_NAME = 'exchange_account_id';

-- 4. Verificar o índice atual
SELECT 
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as COLUMNS
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_monitor_alerts'
  AND INDEX_NAME = 'wh_monitor_alerts_active_idx'
GROUP BY INDEX_NAME;

-- 5. Verificar foreign key
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_monitor_alerts'
  AND CONSTRAINT_NAME = 'webhook_monitor_alerts_exchange_account_id_fkey';

-- 6. Se a migration falhou mas as mudanças NÃO foram aplicadas,
--    marcar como rolled back:
-- UPDATE `_prisma_migrations` 
-- SET finished_at = NOW(),
--     logs = NULL
-- WHERE migration_name = '20251210000000_refactor_webhook_monitor_one_per_webhook'
--   AND finished_at IS NULL;

-- 7. Se as mudanças foram aplicadas parcialmente ou completamente,
--    marcar como aplicada:
-- UPDATE `_prisma_migrations` 
-- SET finished_at = NOW(),
--     logs = NULL
-- WHERE migration_name = '20251210000000_refactor_webhook_monitor_one_per_webhook'
--   AND finished_at IS NULL;

