export * from './whatsapp-client';
export * from './notification.service';
export * from './template.service';
export * from './notification-http.service';
export * from './email.service';
export * from './webpush.service';

// Exportar unified-template-service com nomes específicos para evitar conflito
export {
  UnifiedTemplateService,
  type NotificationChannel,
  type TemplateType,
  type TemplateRenderResult,
} from './unified-template.service';

// Exportar tipos explicitamente
export type { NotificationTemplateType } from './notification.service';
export type { EmailOptions } from './email.service';
export type { WebPushPayload, WebPushSubscriptionKeys, SendWebPushResult } from './webpush.service';

