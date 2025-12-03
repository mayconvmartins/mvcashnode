<!-- db567663-9aa4-4c5c-810e-ea65f6818f4f ce88cb59-7937-4692-b573-9b345c1c57a3 -->
# Implementação de WebSocket no Backend NestJS

## Análise

O backend atualmente não possui servidor WebSocket implementado. O frontend está tentando conectar mas falha porque não há servidor disponível.

## Implementação

### 1. Instalar dependências

- Adicionar `@nestjs/websockets` e `@nestjs/platform-ws` ao `package.json` do backend
- Adicionar `ws` como dependência (WebSocket library)

### 2. Criar módulo WebSocket

- Criar `apps/api/src/websocket/websocket.module.ts`
- Criar `apps/api/src/websocket/websocket.gateway.ts` com:
- Autenticação via token (query parameter)
- Handlers para eventos: `ping/pong`, `subscribe/unsubscribe`
- Emissão de eventos: `position.updated`, `position.closed`, `order.filled`, `webhook.received`, `job.completed`, etc.

### 3. Criar serviço WebSocket

- Criar `apps/api/src/websocket/websocket.service.ts` para:
- Gerenciar conexões ativas
- Emitir eventos para clientes específicos ou broadcast
- Integrar com eventos do sistema (posições, jobs, webhooks)

### 4. Configurar no AppModule

- Importar `WebSocketModule` no `app.module.ts`
- Configurar CORS para WebSocket no `main.ts`

### 5. Integrar com serviços existentes

- Conectar eventos de `PositionsService`, `TradeJobsService`, `WebhooksService` ao WebSocket
- Emitir eventos quando posições são atualizadas, jobs completam, webhooks são recebidos

### 6. Configurar porta WebSocket

- Usar a mesma porta HTTP ou porta separada (configurável via env)
- Suportar wss:// em produção (HTTPS)

## Arquivos a criar/modificar

- `apps/api/package.json` - adicionar dependências
- `apps/api/src/websocket/websocket.module.ts` - novo módulo
- `apps/api/src/websocket/websocket.gateway.ts` - gateway principal
- `apps/api/src/websocket/websocket.service.ts` - serviço de gerenciamento
- `apps/api/src/app.module.ts` - importar WebSocketModule
- `apps/api/src/main.ts` - configurar CORS para WebSocket
- Integrar com `positions.service.ts`, `trade-jobs.service.ts`, `webhooks.service.ts`

### To-dos

- [ ] Adicionar variável NEXT_PUBLIC_WEBHOOK_URL e atualizar exibição de URLs de webhook no frontend
- [ ] Corrigir controller de trade parameters para aceitar exchange_account_id do frontend
- [ ] Corrigir WebSocket para usar wss:// automaticamente quando a página estiver em HTTPS
- [ ] Adicionar dependências @nestjs/websockets, @nestjs/platform-ws e ws ao package.json
- [ ] Criar WebSocketModule e WebSocketGateway com autenticação via token
- [ ] Criar WebSocketService para gerenciar conexões e emitir eventos
- [ ] Configurar WebSocket no AppModule e main.ts (CORS)
- [ ] Integrar WebSocket com PositionsService, TradeJobsService e WebhooksService
- [ ] Adicionar dependências @nestjs/websockets, @nestjs/platform-ws e ws ao package.json
- [ ] Criar WebSocketModule e WebSocketGateway com autenticação via token
- [ ] Criar WebSocketService para gerenciar conexões e emitir eventos
- [ ] Configurar WebSocket no AppModule e main.ts (CORS)
- [ ] Integrar WebSocket com PositionsService, TradeJobsService e WebhooksService
- [ ] Adicionar dependências @nestjs/websockets, @nestjs/platform-ws e ws ao package.json
- [ ] Criar WebSocketModule e WebSocketGateway com autenticação via token
- [ ] Criar WebSocketService para gerenciar conexões e emitir eventos
- [ ] Configurar WebSocket no AppModule e main.ts (CORS)
- [ ] Integrar WebSocket com PositionsService, TradeJobsService e WebhooksService