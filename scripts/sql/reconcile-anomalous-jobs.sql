-- ============================================
-- Script de Reconciliação: Jobs Anômalos
-- ============================================
-- Este script identifica e corrige jobs com status FAILED/CANCELED/SKIPPED
-- que possuem execuções preenchidas (FILLED) na exchange.
-- 
-- PROBLEMA: Race condition onde a ordem é executada na exchange, mas
-- o job é marcado como FAILED/CANCELED/SKIPPED devido a verificações
-- tardias de posição ou outros erros.
--
-- ATENÇÃO: Execute primeiro o SELECT para verificar os dados antes do UPDATE
-- ============================================

-- ============================================
-- PARTE 1: IDENTIFICAR JOBS ANÔMALOS (DIAGNÓSTICO)
-- ============================================

-- Query para identificar jobs SELL anômalos
SELECT 
  j.id as job_id,
  j.status as job_status,
  j.side,
  j.symbol,
  j.reason_code,
  j.reason_message,
  j.position_id_to_close,
  j.created_at as job_created_at,
  j.updated_at as job_updated_at,
  p.id as pos_id,
  p.status as pos_status,
  p.closed_at as pos_closed_at,
  p.close_reason,
  e.id as exec_id,
  e.exchange_order_id,
  e.status_exchange,
  e.executed_qty,
  e.avg_price,
  e.created_at as exec_created_at
FROM trade_jobs j
LEFT JOIN trade_positions p ON p.id = j.position_id_to_close
JOIN trade_executions e ON e.trade_job_id = j.id
WHERE j.side = 'SELL'
  AND j.status IN ('FAILED', 'CANCELED', 'SKIPPED')
  AND e.executed_qty > 0
  AND (e.status_exchange = 'FILLED' OR e.status_exchange = 'closed')
ORDER BY j.created_at DESC;

-- Contagem de jobs anômalos por status
SELECT 
  j.status,
  COUNT(*) as total_anomalos
FROM trade_jobs j
JOIN trade_executions e ON e.trade_job_id = j.id
WHERE j.side = 'SELL'
  AND j.status IN ('FAILED', 'CANCELED', 'SKIPPED')
  AND e.executed_qty > 0
  AND (e.status_exchange = 'FILLED' OR e.status_exchange = 'closed')
GROUP BY j.status;

-- ============================================
-- PARTE 2: CORRIGIR JOBS ANÔMALOS (UPDATE)
-- ============================================
-- ATENÇÃO: Execute apenas APÓS verificar os dados com a query acima!

-- Atualizar jobs SELL que estão FAILED/CANCELED/SKIPPED mas foram executados na exchange
UPDATE trade_jobs j
JOIN trade_executions e ON e.trade_job_id = j.id
SET 
  j.status = 'FILLED',
  j.reason_code = CONCAT('ANOMALY_RECONCILED_FROM_', j.status),
  j.reason_message = CONCAT(
    'Reconciliado em ', NOW(), ': job estava ', j.status, 
    ' mas ordem foi executada na exchange (order_id=', e.exchange_order_id, 
    ', qty=', e.executed_qty, ', price=', e.avg_price, '). ',
    'Motivo original: ', IFNULL(j.reason_message, 'N/A')
  ),
  j.updated_at = NOW()
WHERE j.side = 'SELL'
  AND j.status IN ('FAILED', 'CANCELED', 'SKIPPED')
  AND e.executed_qty > 0
  AND (e.status_exchange = 'FILLED' OR e.status_exchange = 'closed')
  AND j.reason_code NOT LIKE 'ANOMALY_RECONCILED%';

-- ============================================
-- PARTE 3: CORRIGIR JOBS EXCHANGE_SYNC COM order_type='MARKET'
-- ============================================
-- Atualiza jobs importados que ainda têm order_type='MARKET' para 'IMPORTED'

-- Primeiro, verificar quantos jobs precisam ser corrigidos
SELECT COUNT(*) as jobs_market_exchange_sync
FROM trade_jobs
WHERE created_by = 'EXCHANGE_SYNC'
  AND order_type = 'MARKET';

-- Atualizar para IMPORTED
UPDATE trade_jobs
SET 
  order_type = 'IMPORTED',
  reason_message = CONCAT(
    IFNULL(reason_message, ''),
    ' [Corrigido em ', NOW(), ': order_type alterado de MARKET para IMPORTED]'
  ),
  updated_at = NOW()
WHERE created_by = 'EXCHANGE_SYNC'
  AND order_type = 'MARKET';

-- ============================================
-- PARTE 4: VERIFICAÇÃO PÓS-CORREÇÃO
-- ============================================

-- Verificar se ainda existem jobs anômalos após a correção
SELECT 
  COUNT(*) as jobs_anomalos_restantes
FROM trade_jobs j
JOIN trade_executions e ON e.trade_job_id = j.id
WHERE j.side = 'SELL'
  AND j.status IN ('FAILED', 'CANCELED', 'SKIPPED')
  AND e.executed_qty > 0
  AND (e.status_exchange = 'FILLED' OR e.status_exchange = 'closed');

-- Verificar jobs EXCHANGE_SYNC que ainda têm MARKET
SELECT COUNT(*) as jobs_market_restantes
FROM trade_jobs
WHERE created_by = 'EXCHANGE_SYNC'
  AND order_type = 'MARKET';

-- ============================================
-- FIM DO SCRIPT
-- ============================================
