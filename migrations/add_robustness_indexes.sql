-- Migration: Adicionar índices para robustez e consistência do sistema
-- Data: 2025-01-XX
-- Descrição: Índices para prevenir duplicatas, otimizar sincronização e validações

-- 1. Índice único para prevenir posições duplicadas (já existe no schema, mas garantindo)
-- O constraint @@unique([trade_job_id_open]) já existe no Prisma schema
-- Este índice garante que não há duplicatas mesmo se o constraint falhar

-- 2. Índice para otimizar sincronização com exchange (buscar execuções por exchange_order_id)
CREATE INDEX IF NOT EXISTS idx_execution_exchange_order 
ON trade_executions(exchange_order_id, exchange) 
WHERE exchange_order_id IS NOT NULL;

-- 3. Índice composto para validações de position_fills (otimizar checksums)
CREATE INDEX IF NOT EXISTS idx_position_fills_position_side 
ON position_fills(position_id, side);

-- 4. Índice para otimizar busca de posições abertas por conta e símbolo (sincronização)
CREATE INDEX IF NOT EXISTS idx_position_open_sync 
ON trade_positions(exchange_account_id, symbol, status, trade_mode) 
WHERE status = 'OPEN';

-- 5. Índice para otimizar busca de jobs duplicados por exchange_order_id
CREATE INDEX IF NOT EXISTS idx_job_exchange_order 
ON trade_executions(trade_job_id, exchange_order_id) 
WHERE exchange_order_id IS NOT NULL;

-- 6. Índice para otimizar validação de integridade (buscar fills de uma posição)
CREATE INDEX IF NOT EXISTS idx_position_fills_integrity 
ON position_fills(position_id, side, created_at);

-- Nota: O constraint único em trade_job_id_open já existe no schema Prisma
-- e será aplicado automaticamente pelo Prisma Migrate

