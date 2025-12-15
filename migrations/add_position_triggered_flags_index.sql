-- Migration: Adicionar índice para melhorar performance de queries com flags triggered
-- Data: 2025-12-15
-- Descrição: Cria índice composto em trade_positions para otimizar consultas
--            do monitor SL/TP que filtram por sl_triggered, tp_triggered, trailing_triggered e status

-- Índice composto para consultas frequentes do monitor
CREATE INDEX IF NOT EXISTS idx_position_triggered_flags 
ON trade_positions(sl_triggered, tp_triggered, trailing_triggered, status)
WHERE status = 'OPEN';

-- Índice adicional para consultas que filtram por trade_mode
CREATE INDEX IF NOT EXISTS idx_position_sltp_monitor 
ON trade_positions(trade_mode, status, sl_triggered, tp_triggered, trailing_triggered)
WHERE status = 'OPEN' AND (sl_enabled = true OR tp_enabled = true OR trailing_enabled = true);

-- Comentários para documentação
COMMENT ON INDEX idx_position_triggered_flags IS 'Otimiza queries do monitor SL/TP que buscam posições com flags triggered';
COMMENT ON INDEX idx_position_sltp_monitor IS 'Otimiza queries do monitor SL/TP por trade_mode e flags de trigger';

