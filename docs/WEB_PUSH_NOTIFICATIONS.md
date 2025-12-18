# Web Push Notifications

## Visão Geral

O MVCash agora suporta notificações push via navegador, permitindo que usuários recebam alertas mesmo quando não estão com o site aberto. Esta funcionalidade integra-se ao PWA existente.

## Funcionalidades

### Tipos de Notificações

1. **Webhooks Recebidos**: Alertas quando um webhook é processado
2. **Posições Abertas**: Notificação de nova posição
3. **Posições Fechadas**: Resultado da posição (lucro/prejuízo)
4. **Stop Loss Atingido**: Alerta de SL executado
5. **Take Profit Atingido**: Alerta de TP executado
6. **Stop Gain Atingido**: Alerta de SG executado
7. **Trailing Stop Gain**: Alerta de TSG executado
8. **Erros de Trade**: Notificação de falhas
9. **Assinaturas**: Ativação, expiração e renovação

### Canais Disponíveis

O sistema de notificações suporta 3 canais:
- **WhatsApp**: Via Evolution API
- **Email**: Via SMTP
- **Web Push**: Via Service Worker (NOVO)

## Arquitetura

### Backend

#### Modelo Prisma

```prisma
model WebPushSubscription {
  id          Int      @id @default(autoincrement())
  user_id     Int
  endpoint    String   @db.Text
  p256dh      String   @db.Text
  auth        String   @db.Text
  user_agent  String?  @db.Text
  device_name String?  @db.VarChar(255)
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  
  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@unique([user_id, endpoint])
  @@index([user_id])
  @@map("web_push_subscriptions")
}
```

#### WebPushService (`packages/notifications/src/webpush.service.ts`)

```typescript
class WebPushService {
  // Configuração
  isEnabled(): boolean
  getVapidPublicKey(): string | null
  
  // Subscriptions
  subscribe(userId, keys, userAgent?, deviceName?): Promise<void>
  unsubscribe(userId, endpoint): Promise<void>
  listSubscriptions(userId): Promise<Subscription[]>
  
  // Envio
  sendToUser(userId, payload, templateType?): Promise<SendResult>
  sendToAllUsers(payload, templateType?): Promise<SendResult>
  
  // Teste
  sendTestNotification(userId): Promise<SendResult>
}
```

#### Endpoints da API

```
GET    /notifications/webpush/vapid-public-key  # Obter chave pública VAPID
POST   /notifications/webpush/subscribe         # Registrar subscription
DELETE /notifications/webpush/unsubscribe       # Remover subscription
GET    /notifications/webpush/subscriptions     # Listar subscriptions
POST   /notifications/webpush/test              # Enviar notificação de teste
```

### Frontend

#### Service Worker (`apps/frontend/public/sw.js`)

```javascript
// Recebe eventos push
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: data.data,
      actions: data.actions,
    })
  );
});

// Trata cliques na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
```

#### WebPushProvider (`apps/frontend/src/components/providers/WebPushProvider.tsx`)

Provider React que gerencia:
- Registro do Service Worker
- Solicitação de permissão
- Inscrição automática
- Estado da subscription

#### Utilitários (`apps/frontend/src/lib/utils/webpush.ts`)

```typescript
// Registrar service worker
registerServiceWorker(): Promise<ServiceWorkerRegistration>

// Obter permissão
requestNotificationPermission(): Promise<boolean>

// Inscrever para notificações
subscribeToPushNotifications(deviceName?): Promise<boolean>

// Cancelar inscrição
unsubscribeFromPushNotifications(): Promise<boolean>

// Verificar suporte
isWebPushSupported(): boolean
```

## Configuração

### Variáveis de Ambiente

```env
# Web Push (VAPID Keys)
VAPID_PUBLIC_KEY=BNhxE...sua-chave-publica...
VAPID_PRIVATE_KEY=sua-chave-privada
VAPID_SUBJECT=mailto:admin@mvcash.com.br
```

### Gerar Chaves VAPID

```bash
npx web-push generate-vapid-keys
```

## Uso

### Ativar Notificações (Usuário)

1. Acesse qualquer página do dashboard
2. O sistema solicitará permissão automaticamente
3. Clique em "Permitir" no popup do navegador
4. Pronto! Você receberá notificações push

### Testar Notificações (Admin)

1. Acesse Admin → Notificações
2. Vá para a aba "Testar Envio"
3. Clique em "Testar Web Push"

### Gerenciar Subscriptions (Admin)

```bash
# Listar todas subscriptions de um usuário
GET /notifications/webpush/subscriptions

# Remover subscription específica
DELETE /notifications/webpush/unsubscribe
```

## Integração com Templates

As notificações Web Push usam o mesmo sistema de templates unificados:

```typescript
// Exemplo de template Web Push
{
  templateType: 'POSITION_OPENED',
  channel: 'webpush',
  subject: 'Posição Aberta: {symbol}',
  body: '{side} - Quantidade: {quantity} @ ${entry_price}',
  iconUrl: '/icons/icon-192x192.png',
  actionUrl: '/positions',
}
```

### Variáveis Disponíveis

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `{symbol}` | Par de trading | BTCUSDT |
| `{side}` | Lado da operação | LONG/SHORT |
| `{quantity}` | Quantidade | 0.5 |
| `{entry_price}` | Preço de entrada | 50000.00 |
| `{exit_price}` | Preço de saída | 51000.00 |
| `{pnl}` | Lucro/Prejuízo | 50.00 |
| `{pnl_pct}` | PnL percentual | 2.5 |
| `{timestamp}` | Data/hora | 18/12/2025 14:30 |

## Dependências

### Backend
- `web-push@^3.6.6`: Biblioteca para envio de Web Push

### Frontend
- Service Worker nativo do navegador
- Push API nativa

## Compatibilidade

### Navegadores Suportados
- Chrome 50+
- Firefox 44+
- Edge 17+
- Safari 16+ (macOS Ventura+, iOS 16.4+)
- Opera 37+

### Limitações
- Safari no iOS requer que o site seja adicionado à tela inicial (PWA)
- Algumas versões do Firefox podem ter problemas com VAPID
- O usuário deve conceder permissão explícita

## Troubleshooting

### Notificações não aparecem
1. Verifique se as notificações estão permitidas no navegador
2. Confirme que as chaves VAPID estão configuradas
3. Verifique os logs do servidor para erros

### Service Worker não registra
1. Verifique se está usando HTTPS
2. Confirme que o arquivo `sw.js` está na raiz do public
3. Limpe o cache do navegador

### Erro "InvalidStateError"
1. O Service Worker pode já estar registrado
2. Desregistre e registre novamente
3. Limpe as subscriptions antigas do banco

## Monitoramento

### Métricas Importantes
- Taxa de entrega de notificações
- Subscriptions ativas vs inativas
- Erros de envio por tipo

### Logs

```bash
# Backend
[WEBPUSH] Enviando notificação para usuário 123
[WEBPUSH] Sucesso: 1 enviado, 0 falhou

# Frontend
[WebPush] Service Worker registrado
[WebPush] Subscription criada com sucesso
```

