-- Reconcile SELL jobs that are marked SKIPPED but have executions that indicate they were executed on the exchange.
-- Goal: make status consistent (SKIPPED cannot have executed quantities / closed orders).
--
-- IMPORTANT: review results in a transaction first on production.

START TRANSACTION;

-- Preview impacted rows
SELECT
  j.id              AS job_id,
  j.status          AS job_status,
  j.reason_code,
  j.position_id_to_close,
  j.created_by,
  j.created_at,
  e.id              AS execution_id,
  e.exchange_order_id,
  e.status_exchange,
  e.executed_qty,
  e.avg_price
FROM trade_jobs j
JOIN trade_executions e ON e.trade_job_id = j.id
WHERE j.side = 'SELL'
  AND j.status = 'SKIPPED'
  AND (
    e.executed_qty > 0
    OR e.status_exchange IN ('FILLED', 'closed')
    OR (e.exchange_order_id IS NOT NULL AND e.exchange_order_id <> '')
  )
ORDER BY j.created_at DESC;

-- Apply reconciliation
UPDATE trade_jobs j
JOIN trade_executions e ON e.trade_job_id = j.id
SET
  j.status = CASE
    WHEN e.executed_qty > 0 AND e.status_exchange IN ('FILLED', 'closed') THEN 'FILLED'
    WHEN e.executed_qty > 0 THEN 'PARTIALLY_FILLED'
    ELSE j.status
  END,
  j.reason_code = 'ANOMALY_SKIPPED_BUT_EXECUTED',
  j.reason_message = CONCAT(
    'Anomalia reconciliada: job estava SKIPPED mas há execução na exchange (execution_id=',
    e.id,
    ', exchange_order_id=',
    COALESCE(e.exchange_order_id, 'NULL'),
    ', status_exchange=',
    COALESCE(e.status_exchange, 'NULL'),
    ', executed_qty=',
    COALESCE(CAST(e.executed_qty AS CHAR), '0'),
    ').'
  ),
  j.updated_at = NOW()
WHERE j.side = 'SELL'
  AND j.status = 'SKIPPED'
  AND (
    e.executed_qty > 0
    OR e.status_exchange IN ('FILLED', 'closed')
    OR (e.exchange_order_id IS NOT NULL AND e.exchange_order_id <> '')
  );

-- Sanity check after update
SELECT
  j.id AS job_id,
  j.status AS job_status,
  j.reason_code,
  j.updated_at
FROM trade_jobs j
WHERE j.reason_code = 'ANOMALY_SKIPPED_BUT_EXECUTED'
ORDER BY j.updated_at DESC
LIMIT 200;

COMMIT;

