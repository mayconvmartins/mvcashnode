/* Migrar templates WhatsApp legados para tabela unificada */
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
