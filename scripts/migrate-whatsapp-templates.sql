-- ============================================
-- Script de Migração: Templates WhatsApp Legados -> Unificados
-- ============================================
-- Este script copia os templates da tabela legada (whatsapp_notification_templates)
-- para a tabela unificada (notification_templates), mapeando os tipos de template.
--
-- IMPORTANTE: Execute este script ANTES de fazer deploy do código que usa a tabela unificada.
-- ============================================

-- Migrar templates WhatsApp legados para tabela unificada
INSERT INTO notification_templates (template_type, name, channel, body, is_active, created_at, updated_at)
SELECT 
  CASE template_type
    WHEN 'STOP_LOSS_TRIGGERED' THEN 'SL_HIT'
    WHEN 'STOP_GAIN_TRIGGERED' THEN 'SG_HIT'
    WHEN 'TRAILING_STOP_GAIN_TRIGGERED' THEN 'TSG_HIT'
    WHEN 'PARTIAL_TP_TRIGGERED' THEN 'PARTIAL_TP'
    ELSE template_type
  END as template_type,
  name,
  'whatsapp' as channel,
  body,
  is_active,
  created_at,
  NOW() as updated_at
FROM whatsapp_notification_templates
WHERE is_active = true
ON DUPLICATE KEY UPDATE 
  body = VALUES(body),
  name = VALUES(name),
  updated_at = NOW();

-- Verificar resultado da migração
SELECT 
  'MIGRAÇÃO CONCLUÍDA' as status,
  COUNT(*) as templates_migrados
FROM notification_templates 
WHERE channel = 'whatsapp';

-- Listar templates migrados
SELECT 
  template_type,
  name,
  channel,
  is_active,
  LEFT(body, 50) as body_preview
FROM notification_templates
WHERE channel = 'whatsapp'
ORDER BY template_type;
