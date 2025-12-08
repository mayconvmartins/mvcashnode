-- Script para verificar e corrigir a migration de agrupamento de posições
-- Execute este SQL diretamente no banco MySQL

-- 1. Verificar o estado atual da migration
SELECT 
    migration_name,
    finished_at,
    applied_steps_count,
    logs
FROM `_prisma_migrations` 
WHERE migration_name = '20250213000000_add_position_grouping';

-- 2. Verificar se as colunas já existem
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'trade_parameters'
  AND COLUMN_NAME IN ('group_positions_enabled', 'group_positions_interval_minutes');

SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'trade_positions'
  AND COLUMN_NAME IN ('is_grouped', 'group_started_at');

-- 3. Verificar se a tabela position_grouped_jobs existe
SELECT 
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'position_grouped_jobs';

-- 4. Verificar se o índice existe
SELECT 
    INDEX_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'trade_positions'
  AND INDEX_NAME = 'trade_positions_grouping_idx';

-- 5. Se a migration falhou mas as mudanças já foram aplicadas parcialmente,
--    você pode marcar como resolvida executando:
-- UPDATE `_prisma_migrations` 
-- SET finished_at = NOW(),
--     logs = NULL
-- WHERE migration_name = '20250213000000_add_position_grouping'
--   AND finished_at IS NULL;

-- 6. Se as mudanças NÃO foram aplicadas, você pode aplicar manualmente:
--    (Execute os comandos da migration.sql um por um, verificando erros)







