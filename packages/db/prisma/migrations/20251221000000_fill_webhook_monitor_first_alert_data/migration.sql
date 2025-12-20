-- Preencher price_first_alert e replacement_count para alertas existentes
-- Esta migration reconstroi a cadeia de substituições para alertas que têm replaced_alert_id

-- Passo 1: Inicializar price_original e price_first_alert com price_alert para alertas que não têm
UPDATE `webhook_monitor_alerts` 
SET `price_original` = `price_alert`,
    `price_first_alert` = `price_alert`,
    `replacement_count` = 0
WHERE `price_original` IS NULL OR `price_first_alert` IS NULL;

-- Passo 2: Para alertas que têm replaced_alert_id, reconstruir a cadeia recursivamente
-- Como MySQL não suporta CTEs recursivas em versões antigas, fazemos uma abordagem iterativa
-- Vamos fazer até 10 iterações (considerando que uma cadeia raramente tem mais que 10 alertas)

-- Iteração 1: Atualizar alertas que substituem alertas sem replaced_alert_id (primeiro da cadeia)
UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.replaced_alert_id IS NULL;

-- Iteração 2-10: Atualizar alertas que substituem outros alertas já processados
UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

UPDATE `webhook_monitor_alerts` current
INNER JOIN `webhook_monitor_alerts` replaced ON current.replaced_alert_id = replaced.id
SET 
    current.price_first_alert = replaced.price_first_alert,
    current.replacement_count = replaced.replacement_count + 1,
    current.price_original = current.price_alert
WHERE current.replaced_alert_id IS NOT NULL 
  AND replaced.price_first_alert IS NOT NULL
  AND (current.price_first_alert IS NULL OR current.price_first_alert = current.price_alert);

-- Passo 3: Recalcular métricas (savings_pct e efficiency_pct) usando price_first_alert
-- Isso garante que as métricas históricas usem o preço correto do primeiro alerta
UPDATE `webhook_monitor_alerts`
SET 
    savings_pct = CASE
        WHEN state = 'EXECUTED' AND price_first_alert IS NOT NULL AND price_first_alert > 0 AND execution_price IS NOT NULL THEN
            CASE 
                WHEN side = 'BUY' THEN ((price_first_alert - execution_price) / price_first_alert) * 100
                WHEN side = 'SELL' THEN ((execution_price - price_first_alert) / price_first_alert) * 100
                ELSE savings_pct
            END
        ELSE savings_pct
    END,
    efficiency_pct = CASE
        WHEN state = 'EXECUTED' AND price_first_alert IS NOT NULL AND execution_price IS NOT NULL THEN
            CASE
                WHEN side = 'BUY' AND price_minimum IS NOT NULL AND price_first_alert != price_minimum THEN
                    ((price_first_alert - execution_price) / (price_first_alert - price_minimum)) * 100
                WHEN side = 'SELL' AND price_maximum IS NOT NULL AND price_maximum != price_first_alert THEN
                    ((execution_price - price_first_alert) / (price_maximum - price_first_alert)) * 100
                ELSE efficiency_pct
            END
        ELSE efficiency_pct
    END
WHERE state = 'EXECUTED' 
  AND price_first_alert IS NOT NULL
  AND execution_price IS NOT NULL;

