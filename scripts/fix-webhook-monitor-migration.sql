-- Script para verificar e corrigir a migration de webhook monitor
-- Execute este SQL diretamente no banco MySQL

-- 1. Verificar o estado atual da migration
SELECT 
    migration_name,
    finished_at,
    applied_steps_count,
    logs
FROM `_prisma_migrations` 
WHERE migration_name = '20250220000000_add_webhook_monitor';

-- 2. Verificar se a coluna monitor_enabled já existe em webhook_sources
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_sources'
  AND COLUMN_NAME = 'monitor_enabled';

-- 3. Verificar se a tabela webhook_monitor_alerts existe
SELECT 
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_monitor_alerts';

-- 4. Verificar se a tabela webhook_monitor_config existe
SELECT 
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_monitor_config';

-- 5. Verificar se o índice corrigido existe
SELECT 
    INDEX_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'webhook_monitor_alerts'
  AND INDEX_NAME = 'wh_monitor_alerts_active_idx';

-- 6. Se a migration falhou mas as mudanças NÃO foram aplicadas,
--    você pode marcar como resolvida (rolled back) executando:
-- UPDATE `_prisma_migrations` 
-- SET finished_at = NOW(),
--     logs = NULL
-- WHERE migration_name = '20250220000000_add_webhook_monitor'
--   AND finished_at IS NULL;

-- 7. Se as mudanças foram aplicadas parcialmente, você precisa:
--    a) Verificar quais partes foram aplicadas
--    b) Aplicar manualmente as partes faltantes
--    c) Marcar a migration como resolvida

