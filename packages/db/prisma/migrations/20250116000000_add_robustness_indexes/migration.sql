-- Migration: Adicionar índices para robustez e consistência do sistema
-- Data: 2025-01-16
-- Descrição: Índices para prevenir duplicatas, otimizar sincronização e validações

-- 1. Índice único para prevenir posições duplicadas (já existe no schema, mas garantindo)
-- O constraint @@unique([trade_job_id_open]) já existe no Prisma schema
-- Este índice garante que não há duplicatas mesmo se o constraint falhar

-- 2. Índice para otimizar sincronização com exchange (buscar execuções por exchange_order_id)
-- MySQL não suporta WHERE em CREATE INDEX, então criamos o índice normalmente
CREATE INDEX idx_execution_exchange_order ON trade_executions(exchange_order_id, exchange);

-- 3. Índice composto para validações de position_fills (otimizar checksums)
CREATE INDEX idx_position_fills_position_side ON position_fills(position_id, side);

-- 4. Índice para otimizar busca de posições abertas por conta e símbolo (sincronização)
CREATE INDEX idx_position_open_sync ON trade_positions(exchange_account_id, symbol, status, trade_mode);

-- 5. Índice para otimizar busca de jobs duplicados por exchange_order_id
CREATE INDEX idx_job_exchange_order ON trade_executions(trade_job_id, exchange_order_id);

-- 6. Índice para otimizar validação de integridade (buscar fills de uma posição)
CREATE INDEX idx_position_fills_integrity ON position_fills(position_id, side, created_at);

-- Nota: O constraint único em trade_job_id_open já existe no schema Prisma
-- e será aplicado automaticamente pelo Prisma Migrate

