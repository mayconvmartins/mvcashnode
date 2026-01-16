-- ============================================
-- Script: Limpar Flags TSG Travadas (Dados Históricos)
-- ============================================
-- Este script limpa flags tsg_triggered que estão travadas sem job ativo
-- Execução: Manual, uma vez após deploy da correção BUG-013
-- ============================================

-- 1. Verificar posições afetadas (ANTES DA CORREÇÃO)
SELECT 
  p.id, 
  p.symbol, 
  p.tsg_triggered, 
  p.tsg_activated,
  p.status as position_status,
  p.qty_remaining,
  COUNT(j.id) as active_jobs
FROM trade_positions p
LEFT JOIN trade_jobs j ON j.position_id_to_close = p.id 
  AND j.side = 'SELL'
  AND j.status IN ('PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED')
WHERE p.tsg_triggered = true
  AND p.status = 'OPEN'
GROUP BY p.id, p.symbol, p.tsg_triggered, p.tsg_activated, p.status, p.qty_remaining
HAVING active_jobs = 0;

-- 2. Resetar flags TSG travadas sem job ativo
UPDATE trade_positions p
SET 
  p.tsg_triggered = false,
  p.updated_at = NOW()
WHERE p.id IN (
  SELECT id FROM (
    SELECT p2.id
    FROM trade_positions p2
    LEFT JOIN trade_jobs j ON j.position_id_to_close = p2.id 
      AND j.side = 'SELL'
      AND j.status IN ('PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED')
    WHERE p2.tsg_triggered = true
      AND p2.status = 'OPEN'
      AND j.id IS NULL
  ) AS subquery
);

-- 3. Verificar resultado (APÓS A CORREÇÃO)
SELECT 
  COUNT(*) as positions_fixed,
  'Flags TSG resetadas com sucesso' as message
FROM trade_positions
WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 5 SECOND)
  AND tsg_triggered = false;

-- 4. Verificar se ainda há flags travadas
SELECT 
  COUNT(*) as remaining_stuck_flags
FROM trade_positions p
LEFT JOIN trade_jobs j ON j.position_id_to_close = p.id 
  AND j.side = 'SELL'
  AND j.status IN ('PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED')
WHERE p.tsg_triggered = true
  AND p.status = 'OPEN'
  AND j.id IS NULL;

-- ============================================
-- Resultado Esperado:
-- - 6 posições BTCUSDT devem ter tsg_triggered resetado para false
-- - remaining_stuck_flags deve retornar 0
-- ============================================
