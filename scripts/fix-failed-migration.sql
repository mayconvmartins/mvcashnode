-- Script para corrigir o estado da migration falhada
-- Execute este SQL diretamente no banco MySQL

-- Verificar o estado atual das migrations
SELECT * FROM `_prisma_migrations` WHERE migration_name = '20251204075531_';

-- Se a migration estiver marcada como falhada mas já aplicada, atualizar o status
UPDATE `_prisma_migrations` 
SET finished_at = NOW(),
    logs = NULL
WHERE migration_name = '20251204075531_'
  AND finished_at IS NULL;

-- Verificar novamente
SELECT * FROM `_prisma_migrations` WHERE migration_name = '20251204075531_';

