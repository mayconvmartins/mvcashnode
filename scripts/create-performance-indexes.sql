-- ============================================
-- ÍNDICES PARA OTIMIZAR PERFORMANCE DO DASHBOARD
-- ============================================
-- Este script cria índices compostos para otimizar as queries lentas:
-- - GET /reports/pnl/summary
-- - GET /reports/open-positions/summary
-- - GET /positions

-- ============================================
-- ÍNDICES PARA trade_positions
-- ============================================

-- Índice composto para queries de posições fechadas com filtro de data
-- Usado em: WHERE exchange_account_id IN (...) AND status = 'CLOSED' AND trade_mode = ? AND closed_at BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_trade_positions_account_status_mode_closed 
ON trade_positions(exchange_account_id, status, trade_mode, closed_at);

-- Índice composto para queries de posições abertas
-- Usado em: WHERE exchange_account_id IN (...) AND status = 'OPEN' AND trade_mode = ?
CREATE INDEX IF NOT EXISTS idx_trade_positions_account_status_mode 
ON trade_positions(exchange_account_id, status, trade_mode);

-- Índice para queries filtradas por símbolo
-- Usado em: WHERE exchange_account_id IN (...) AND status = ? AND trade_mode = ? AND symbol = ?
CREATE INDEX IF NOT EXISTS idx_trade_positions_account_status_mode_symbol 
ON trade_positions(exchange_account_id, status, trade_mode, symbol);

-- Índice para queries com paginação (ordenadas por created_at)
-- Usado em: WHERE exchange_account_id IN (...) AND status = ? AND trade_mode = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_trade_positions_account_status_mode_created 
ON trade_positions(exchange_account_id, status, trade_mode, created_at);

-- Índice para agregações de profit/loss (realized_profit_usd > 0 ou < 0)
-- Usado em: WHERE ... AND realized_profit_usd > 0 (ou < 0)
CREATE INDEX IF NOT EXISTS idx_trade_positions_realized_profit 
ON trade_positions(exchange_account_id, status, trade_mode, realized_profit_usd);

-- Índice para queries que filtram apenas por status e closed_at (sem exchange_account_id)
-- Usado em agregações de dailyPnL
CREATE INDEX IF NOT EXISTS idx_trade_positions_status_closed_at 
ON trade_positions(status, closed_at);

-- Índice para getPnLBySymbol (agrupa por symbol)
CREATE INDEX IF NOT EXISTS idx_trade_positions_symbol_status 
ON trade_positions(exchange_account_id, status, trade_mode, symbol, closed_at);

-- Índice para getPnLByDay (agrupa por data de fechamento)
CREATE INDEX IF NOT EXISTS idx_trade_positions_closed_at_date 
ON trade_positions(exchange_account_id, status, trade_mode, closed_at);

-- ============================================
-- ÍNDICES PARA exchange_accounts
-- ============================================

-- Índice composto para validação de permissões
-- Usado em: WHERE user_id = ? AND id = ? (validação de que conta pertence ao usuário)
CREATE INDEX IF NOT EXISTS idx_exchange_accounts_user_id_id 
ON exchange_accounts(user_id, id);

-- ============================================
-- ÍNDICES PARA trade_jobs
-- ============================================

-- Índice composto para queries de jobs por status
-- Usado em: WHERE exchange_account_id IN (...) AND status = ?
CREATE INDEX IF NOT EXISTS idx_trade_jobs_account_status 
ON trade_jobs(exchange_account_id, status);

-- ============================================
-- VERIFICAR ÍNDICES CRIADOS
-- ============================================

-- Para verificar os índices criados:
-- SHOW INDEX FROM trade_positions;

-- Para ver o tamanho dos índices:
-- SELECT 
--   TABLE_NAME,
--   INDEX_NAME,
--   ROUND(STAT_VALUE * @@innodb_page_size / 1024 / 1024, 2) AS 'Size (MB)'
-- FROM 
--   mysql.innodb_index_stats 
-- WHERE 
--   DATABASE_NAME = DATABASE() 
--   AND TABLE_NAME = 'trade_positions'
--   AND STAT_NAME = 'size'
-- ORDER BY 
--   STAT_VALUE DESC;

-- ============================================
-- NOTAS
-- ============================================
-- 1. Os índices IF NOT EXISTS podem não funcionar em todas as versões do MySQL
--    Se der erro, remova o "IF NOT EXISTS" e execute manualmente
-- 2. A criação de índices pode demorar alguns minutos dependendo do tamanho da tabela
-- 3. Os índices ocupam espaço em disco, mas melhoram significativamente a performance
-- 4. Após criar os índices, as queries devem passar de ~2.7s para <100ms

