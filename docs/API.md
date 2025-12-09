# Documentação da API

Este documento descreve todos os endpoints da API REST do Trading Automation Backend.

## Visão Geral

A API é uma API REST baseada em NestJS que fornece endpoints para:
- Autenticação e gerenciamento de usuários
- Gerenciamento de contas de exchange
- Cofres virtuais
- Posições e trading
- Webhooks
- Relatórios e métricas
- Administração

**Base URL**: `http://localhost:4010` (desenvolvimento)

**Documentação Interativa**: Acesse `/api-docs` quando a API estiver rodando para ver a documentação Swagger interativa.

## Autenticação

A API usa **JWT (JSON Web Tokens)** para autenticação. A maioria dos endpoints requer um token de acesso válido.

### Como Autenticar

1. Faça login via `POST /auth/login` para obter tokens
2. Use o `accessToken` no header `Authorization: Bearer <token>`
3. Quando o token expirar, use `POST /auth/refresh` para renovar

### 2FA (Autenticação de Dois Fatores)

Se o usuário tiver 2FA habilitado:
- O campo `twoFactorCode` é obrigatório no login
- Configure 2FA via `POST /auth/2fa/setup`
- Verifique com `POST /auth/2fa/verify`

## Estrutura de Respostas

### Sucesso

```json
{
  "data": { ... },
  "message": "Operação realizada com sucesso"
}
```

### Erro

```json
{
  "statusCode": 400,
  "message": "Mensagem de erro",
  "error": "Bad Request"
}
```

### Paginação

```json
{
  "data": [ ... ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 100,
    "total_pages": 5
  }
}
```

## Códigos de Status HTTP

- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Requisição inválida
- `401` - Não autenticado
- `403` - Sem permissão
- `404` - Não encontrado
- `409` - Conflito (ex: recurso já existe)
- `429` - Rate limit excedido
- `500` - Erro interno do servidor

## Endpoints por Módulo

### Health Check

#### `GET /`
Mensagem de boas-vindas da API.

**Resposta:**
```json
"Trading Automation API - Bem-vindo!"
```

#### `GET /health`
Health check da API.

**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2025-02-12T10:00:00.000Z"
}
```

---

## Auth - Autenticação

### `POST /auth/login`
Autentica um usuário e retorna tokens de acesso.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "senha123",
  "twoFactorCode": "123456" // Opcional, obrigatório se 2FA habilitado
}
```

**Resposta (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "roles": ["user"]
  }
}
```

### `POST /auth/refresh`
Renova o token de acesso usando o refresh token.

**Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Resposta (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### `POST /auth/2fa/setup`
Configura autenticação de dois fatores (2FA) para o usuário.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "otpauth://totp/...",
  "qrCodeUrl": "https://api.qrserver.com/v1/create-qr-code/...",
  "backupCodes": []
}
```

### `POST /auth/2fa/verify`
Verifica e ativa o código 2FA.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "token": "123456"
}
```

**Resposta (200):**
```json
{
  "valid": true,
  "message": "2FA verificado e ativado com sucesso"
}
```

---

## Users - Usuários

### `GET /users/me`
Obtém dados do usuário autenticado.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "is_active": true,
  "profile": {
    "full_name": "João Silva",
    "phone": "11999999999",
    "whatsapp_phone": "5511999999999"
  },
  "roles": ["user"]
}
```

### `PUT /users/me`
Atualiza dados do usuário autenticado.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "full_name": "João Silva",
  "phone": "11999999999",
  "whatsapp_phone": "5511999999999"
}
```

### `GET /users/me/login-history`
Obtém histórico de login do usuário.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
[
  {
    "id": 1,
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "success": true,
    "created_at": "2025-02-12T10:00:00.000Z"
  }
]
```

---

## Exchange Accounts - Contas de Exchange

### `GET /exchange-accounts`
Lista todas as contas de exchange do usuário.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
[
  {
    "id": 1,
    "exchange": "BINANCE_SPOT",
    "label": "Minha Conta Binance",
    "trade_mode": "REAL",
    "is_active": true,
    "testnet": false,
    "created_at": "2025-02-12T10:00:00.000Z"
  }
]
```

### `POST /exchange-accounts`
Cria uma nova conta de exchange.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "label": "Minha Conta Bybit",
  "exchange": "BYBIT_SPOT",
  "tradeMode": "REAL",
  "apiKey": "sua-api-key",
  "apiSecret": "seu-api-secret",
  "isTestnet": false,
  "isActive": true
}
```

**Resposta (201):**
```json
{
  "id": 1,
  "exchange": "BYBIT_SPOT",
  "label": "Minha Conta Bybit",
  "trade_mode": "REAL",
  "is_active": true,
  "testnet": false,
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

### `GET /exchange-accounts/:id`
Obtém detalhes de uma conta específica.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "id": 1,
  "exchange": "BINANCE_SPOT",
  "label": "Minha Conta Binance",
  "trade_mode": "REAL",
  "is_active": true,
  "testnet": false,
  "created_at": "2025-02-12T10:00:00.000Z",
  "updated_at": "2025-02-12T10:00:00.000Z"
}
```

### `PUT /exchange-accounts/:id`
Atualiza uma conta de exchange.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "label": "Nova Label",
  "apiKey": "nova-api-key",
  "apiSecret": "novo-api-secret",
  "isActive": true
}
```

### `DELETE /exchange-accounts/:id`
Deleta uma conta de exchange.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "message": "Conta deletada com sucesso"
}
```

### `POST /exchange-accounts/:id/test-connection`
Testa a conexão com a exchange.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "success": true,
  "message": "Connection successful. API key validated and account accessible."
}
```

### `GET /exchange-accounts/:id/balances`
Obtém saldos da conta (cache local).

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "success": true,
  "balances": {
    "BTC": {
      "free": 0.5,
      "locked": 0.1,
      "lastSync": "2025-12-02T16:00:00.000Z"
    },
    "USDT": {
      "free": 1000,
      "locked": 200,
      "lastSync": "2025-12-02T16:00:00.000Z"
    }
  },
  "lastSync": "2025-12-02T16:00:00.000Z"
}
```

### `POST /exchange-accounts/:id/sync-balances`
Força sincronização manual dos saldos.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "success": true,
  "message": "Balances synced successfully",
  "balances": {
    "BTC": { "free": 0.5, "locked": 0.1 },
    "USDT": { "free": 1000, "locked": 200 }
  }
}
```

### `POST /exchange-accounts/:id/sync-positions`
Força sincronização manual das posições abertas.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "success": true,
  "message": "Positions synced successfully",
  "positionsFound": 3
}
```

---

## Vaults - Cofres Virtuais

### `GET /vaults`
Lista todos os cofres do usuário.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "Cofre Real",
    "trade_mode": "REAL",
    "description": "Cofre para trading real",
    "created_at": "2025-02-12T10:00:00.000Z"
  }
]
```

### `POST /vaults`
Cria um novo cofre.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "name": "Cofre Real",
  "description": "Cofre para trading real",
  "tradeMode": "REAL"
}
```

**Resposta (201):**
```json
{
  "id": 1,
  "user_id": 1,
  "name": "Cofre Real",
  "trade_mode": "REAL",
  "description": "Cofre para trading real",
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

### `GET /vaults/:id`
Obtém detalhes de um cofre.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "id": 1,
  "user_id": 1,
  "name": "Cofre Real",
  "trade_mode": "REAL",
  "description": "Cofre para trading real",
  "balances": [
    {
      "asset": "USDT",
      "balance": 1000,
      "reserved": 100,
      "available": 900
    }
  ],
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

### `GET /vaults/:id/balances`
Obtém saldos do cofre.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
[
  {
    "asset": "USDT",
    "balance": 1000,
    "reserved": 100,
    "available": 900
  }
]
```

### `GET /vaults/:id/transactions`
Obtém histórico de transações do cofre.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (opcional): Número da página
- `limit` (opcional): Itens por página

**Resposta (200):**
```json
[
  {
    "id": 1,
    "vault_id": 1,
    "transaction_type": "DEPOSIT",
    "asset": "USDT",
    "amount": 100,
    "balance_after": 1100,
    "created_at": "2025-02-12T10:00:00.000Z"
  }
]
```

### `POST /vaults/:id/deposit`
Deposita fundos no cofre.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "asset": "USDT",
  "amount": 100
}
```

**Resposta (200):**
```json
{
  "message": "Depósito realizado com sucesso"
}
```

### `POST /vaults/:id/withdraw`
Saca fundos do cofre.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "asset": "USDT",
  "amount": 50
}
```

**Resposta (200):**
```json
{
  "message": "Saque realizado com sucesso"
}
```

---

## Positions - Posições

### `GET /positions`
Lista posições do usuário.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `status` (opcional): `OPEN` ou `CLOSED`
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `exchange_account_id` (opcional): ID da conta
- `symbol` (opcional): Símbolo do par
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)
- `page` (opcional): Número da página
- `limit` (opcional): Itens por página
- `include_fills` (opcional): Incluir fills na resposta

**Resposta (200):**
```json
{
  "data": [
    {
      "id": 1,
      "exchange_account_id": 1,
      "symbol": "BTCUSDT",
      "side": "BUY",
      "status": "OPEN",
      "qty_total": 0.001,
      "qty_remaining": 0.001,
      "price_open": 50000,
      "current_price": 51000,
      "pnl": 0,
      "pnl_pct": 0,
      "sl_enabled": true,
      "sl_pct": 2.0,
      "tp_enabled": true,
      "tp_pct": 5.0,
      "invested_value_usd": 50.0,
      "current_value_usd": 51.0,
      "unrealized_pnl": 1.0,
      "unrealized_pnl_pct": 2.0,
      "created_at": "2025-02-12T10:00:00.000Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 100,
    "total_pages": 5
  },
  "summary": {
    "total_invested": 1000.0,
    "total_current_value": 1050.0,
    "total_unrealized_pnl": 50.0,
    "total_unrealized_pnl_pct": 5.0,
    "total_realized_pnl": 25.0
  }
}
```

### `GET /positions/monitoring-tp-sl`
Monitora posições com TP/SL ativado.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `exchange_account_id` (opcional): ID da conta

**Resposta (200):**
```json
{
  "data": [
    {
      "id": 1,
      "symbol": "BTCUSDT",
      "trade_mode": "REAL",
      "price_open": 50000,
      "current_price": 51000,
      "pnl_pct": 2.0,
      "tp_enabled": true,
      "tp_pct": 5.0,
      "sl_enabled": true,
      "sl_pct": 2.0,
      "tp_proximity_pct": 40.0,
      "sl_proximity_pct": 0.0,
      "distance_to_tp_pct": 3.0,
      "distance_to_sl_pct": 4.0,
      "status": "PROFIT"
    }
  ]
}
```

### `GET /positions/:id`
Obtém detalhes de uma posição específica.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "id": 1,
  "exchange_account_id": 1,
  "symbol": "BTCUSDT",
  "side": "BUY",
  "status": "OPEN",
  "qty_total": 0.001,
  "qty_remaining": 0.001,
  "price_open": 50000,
  "current_price": 51000,
  "sl_enabled": true,
  "sl_pct": 2.0,
  "tp_enabled": true,
  "tp_pct": 5.0,
  "invested_value_usd": 50.0,
  "current_value_usd": 51.0,
  "unrealized_pnl": 1.0,
  "unrealized_pnl_pct": 2.0,
  "fills": [...],
  "sell_jobs": [...],
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

### `PUT /positions/:id/sltp`
Atualiza Stop Loss e Take Profit da posição.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "slEnabled": true,
  "slPct": 2.0,
  "tpEnabled": true,
  "tpPct": 5.0
}
```

**Resposta (200):**
```json
{
  "id": 1,
  "sl_enabled": true,
  "sl_pct": 2.0,
  "tp_enabled": true,
  "tp_pct": 5.0,
  "updated_at": "2025-02-12T10:30:00.000Z"
}
```

### `PUT /positions/:id/lock-sell-by-webhook`
Trava/desbloqueia venda por webhook.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "lock_sell_by_webhook": true
}
```

**Resposta (200):**
```json
{
  "id": 1,
  "lock_sell_by_webhook": true,
  "updated_at": "2025-02-12T10:30:00.000Z"
}
```

### `POST /positions/:id/close`
Fecha posição (total ou parcial).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "quantity": 0.0005, // Opcional, se não especificar fecha toda
  "orderType": "MARKET", // ou "LIMIT"
  "limitPrice": 52000 // Obrigatório se orderType = "LIMIT"
}
```

**Resposta (201):**
```json
{
  "message": "Job de venda criado com sucesso",
  "positionId": 1,
  "qtyToClose": 0.0005,
  "tradeJobId": 123
}
```

### `POST /positions/:id/sell-limit`
Cria ordem LIMIT de venda para posição.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "limitPrice": 52000,
  "quantity": 0.0005, // Opcional, se não especificar vende toda
  "expiresInHours": 24 // Opcional
}
```

**Resposta (201):**
```json
{
  "message": "Ordem LIMIT de venda criada com sucesso",
  "tradeJobId": 123,
  "limitPrice": 52000,
  "quantity": 0.0005
}
```

---

## Limit Orders - Ordens LIMIT

### `GET /limit-orders`
Lista ordens LIMIT do usuário.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `status` (opcional): `PENDING_LIMIT`, `FILLED`, `CANCELED`, `EXPIRED`, `EXECUTING`
- `side` (opcional): `BUY` ou `SELL`
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `symbol` (opcional): Símbolo do par
- `exchange_account_id` (opcional): ID da conta

**Resposta (200):**
```json
[
  {
    "id": 1,
    "position_id": 1542,
    "symbol": "SOLUSDT",
    "side": "SELL",
    "order_type": "LIMIT",
    "limit_price": 220.50,
    "base_quantity": 5.0,
    "status": "PENDING_LIMIT",
    "exchange_order_id": "12345678",
    "created_at": "2025-02-12T10:00:00.000Z",
    "expires_at": "2025-02-13T10:00:00.000Z"
  }
]
```

### `GET /limit-orders/:id`
Obtém detalhes de uma ordem LIMIT.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "id": 1,
  "position_id": 1542,
  "symbol": "SOLUSDT",
  "side": "SELL",
  "order_type": "LIMIT",
  "limit_price": 220.50,
  "base_quantity": 5.0,
  "status": "PENDING_LIMIT",
  "exchange_order_id": "12345678",
  "exchange_status": "NEW",
  "exchange_account": {
    "id": 1,
    "label": "Binance Spot Real",
    "exchange": "BINANCE_SPOT"
  },
  "position": {
    "id": 1542,
    "status": "OPEN",
    "qty_total": 5.0,
    "qty_remaining": 5.0
  },
  "executions": [...],
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

### `DELETE /limit-orders/:id`
Cancela uma ordem LIMIT.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "message": "Ordem LIMIT cancelada com sucesso",
  "order_id": 1,
  "exchange_order_id": "12345678"
}
```

### `GET /limit-orders/history`
Histórico de ordens LIMIT finalizadas.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)
- `symbol` (opcional): Símbolo do par
- `status` (opcional): `FILLED`, `CANCELED`, `EXPIRED`
- `trade_mode` (opcional): `REAL` ou `SIMULATION`

**Resposta (200):**
```json
[
  {
    "id": 1,
    "symbol": "SOLUSDT",
    "side": "SELL",
    "limit_price": 220.50,
    "base_quantity": 5.0,
    "status": "FILLED",
    "exchange_order_id": "12345678",
    "filled_at": "2025-02-12T11:00:00.000Z",
    "created_at": "2025-02-12T10:00:00.000Z"
  }
]
```

---

## Webhooks

### `POST /webhooks/:code`
Endpoint público para receber webhooks.

**Headers:**
- `X-Signature` (opcional): Assinatura HMAC se `require_signature=true`

**Body:** Texto ou JSON (depende do Content-Type)

**Resposta (200):**
```json
{
  "message": "Webhook recebido com sucesso",
  "event_uid": "evt_1234567890_abc123",
  "accounts_triggered": 2
}
```

### `GET /webhook-sources`
Lista webhook sources do usuário.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
[
  {
    "id": 1,
    "label": "TradingView Alerts",
    "webhook_code": "tradingview-alerts",
    "trade_mode": "REAL",
    "is_active": true,
    "require_signature": false,
    "rate_limit_per_min": 60,
    "url": "http://localhost:4010/webhooks/tradingview-alerts",
    "created_at": "2025-02-12T10:00:00.000Z"
  }
]
```

### `POST /webhook-sources`
Cria um novo webhook source.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "label": "TradingView Alerts",
  "webhook_code": "tradingview-alerts",
  "tradeMode": "REAL",
  "require_signature": false,
  "rate_limit_per_min": 60,
  "allowed_ips": ["192.168.1.1"]
}
```

**Resposta (201):**
```json
{
  "id": 1,
  "label": "TradingView Alerts",
  "webhook_code": "tradingview-alerts",
  "trade_mode": "REAL",
  "is_active": true,
  "url": "http://localhost:4010/webhooks/tradingview-alerts",
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

### `GET /webhook-sources/:id`
Obtém detalhes de um webhook source.

**Headers:** `Authorization: Bearer <token>`

### `PUT /webhook-sources/:id`
Atualiza um webhook source.

**Headers:** `Authorization: Bearer <token>`

### `DELETE /webhook-sources/:id`
Deleta um webhook source.

**Headers:** `Authorization: Bearer <token>`

### `GET /webhook-sources/:sourceId/bindings`
Lista bindings de um webhook source.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
[
  {
    "id": 1,
    "webhook_source_id": 1,
    "exchange_account_id": 1,
    "is_active": true,
    "weight": 1.0,
    "exchange_account": {
      "id": 1,
      "label": "Binance Spot Real",
      "exchange": "BINANCE_SPOT"
    },
    "created_at": "2025-02-12T10:00:00.000Z"
  }
]
```

### `POST /webhook-sources/:sourceId/bindings`
Cria um binding (vincula conta a webhook source).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "exchangeAccountId": 1,
  "isActive": true,
  "weight": 1.0
}
```

**Resposta (201):**
```json
{
  "id": 1,
  "webhook_source_id": 1,
  "exchange_account_id": 1,
  "is_active": true,
  "weight": 1.0,
  "exchange_account": {
    "id": 1,
    "label": "Binance Spot Real",
    "exchange": "BINANCE_SPOT"
  },
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

### `DELETE /webhook-sources/:sourceId/bindings/:bindingId`
Deleta um binding.

**Headers:** `Authorization: Bearer <token>`

### `GET /webhook-events`
Lista eventos de webhook recebidos.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `webhookSourceId` (opcional): ID do webhook source
- `status` (opcional): Status do evento
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `page` (opcional): Número da página
- `limit` (opcional): Itens por página

**Resposta (200):**
```json
{
  "data": [
    {
      "id": 1,
      "webhook_source_id": 1,
      "target_account_id": 1,
      "trade_mode": "REAL",
      "event_uid": "evt_1234567890_abc123",
      "symbol_raw": "SOLUSDT.P",
      "symbol_normalized": "SOLUSDT",
      "action": "BUY_SIGNAL",
      "status": "JOB_CREATED",
      "created_at": "2025-02-12T10:00:00.000Z",
      "processed_at": "2025-02-12T10:00:01.000Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 100,
    "total_pages": 5
  }
}
```

### `GET /webhook-events/:id`
Obtém detalhes de um evento de webhook.

## Monitor Webhook

O Monitor Webhook permite rastrear preços em tempo real antes de executar compras, aguardando o melhor momento de entrada.

### `GET /webhooks/monitor/alerts`
Lista alertas ativos em monitoramento.

**Autenticação**: Requerida

**Resposta:**
```json
[
  {
    "id": 1,
    "webhook_source_id": 1,
    "webhook_event_id": 123,
    "exchange_account_id": 1,
    "symbol": "SOLUSDT",
    "trade_mode": "REAL",
    "price_alert": 100.0,
    "price_minimum": 95.0,
    "current_price": 95.30,
    "state": "MONITORING",
    "cycles_without_new_low": 4,
    "last_price_check_at": "2025-02-20T10:03:30.000Z",
    "created_at": "2025-02-20T10:00:00.000Z",
    "webhook_source": {
      "id": 1,
      "label": "TradingView Alerts",
      "webhook_code": "tv-alerts"
    },
    "exchange_account": {
      "id": 1,
      "label": "Conta Principal",
      "exchange": "BINANCE_SPOT"
    }
  }
]
```

### `GET /webhooks/monitor/alerts/:id`
Obtém detalhes de um alerta específico.

**Autenticação**: Requerida

**Parâmetros:**
- `id` (path): ID do alerta

**Resposta:**
```json
{
  "id": 1,
  "webhook_source_id": 1,
  "webhook_event_id": 123,
  "exchange_account_id": 1,
  "symbol": "SOLUSDT",
  "trade_mode": "REAL",
  "price_alert": 100.0,
  "price_minimum": 95.0,
  "current_price": 95.30,
  "state": "MONITORING",
  "cycles_without_new_low": 4,
  "last_price_check_at": "2025-02-20T10:03:30.000Z",
  "executed_trade_job_id": null,
  "cancel_reason": null,
  "created_at": "2025-02-20T10:00:00.000Z",
  "updated_at": "2025-02-20T10:03:30.000Z"
}
```

### `POST /webhooks/monitor/alerts/:id/cancel`
Cancela um alerta manualmente.

**Autenticação**: Requerida

**Parâmetros:**
- `id` (path): ID do alerta

**Body:**
```json
{
  "reason": "Cancelado manualmente pelo usuário"
}
```

**Resposta:**
```json
{
  "message": "Alerta cancelado com sucesso"
}
```

### `GET /webhooks/monitor/history`
Lista histórico de alertas executados ou cancelados.

**Autenticação**: Requerida

**Query Parameters:**
- `symbol` (opcional): Filtrar por símbolo (ex: `BTCUSDT`)
- `state` (opcional): Filtrar por estado (`EXECUTED` ou `CANCELLED`)
- `startDate` (opcional): Data inicial (ISO string)
- `endDate` (opcional): Data final (ISO string)
- `limit` (opcional): Limite de resultados (padrão: 100)

**Resposta:**
```json
[
  {
    "id": 1,
    "symbol": "SOLUSDT",
    "price_alert": 100.0,
    "price_minimum": 95.0,
    "state": "EXECUTED",
    "executed_trade_job_id": 456,
    "cancel_reason": null,
    "created_at": "2025-02-20T10:00:00.000Z"
  }
]
```

### `GET /webhooks/monitor/config`
Obtém configurações de monitoramento do usuário (ou global se não houver configuração do usuário).

**Autenticação**: Requerida

**Resposta:**
```json
{
  "monitor_enabled": true,
  "check_interval_sec": 30,
  "lateral_tolerance_pct": 0.3,
  "lateral_cycles_min": 4,
  "rise_trigger_pct": 0.75,
  "rise_cycles_min": 2,
  "max_fall_pct": 6.0,
  "max_monitoring_time_min": 60,
  "cooldown_after_execution_min": 30
}
```

### `PUT /webhooks/monitor/config`
Atualiza configurações de monitoramento do usuário.

**Autenticação**: Requerida

**Body:**
```json
{
  "lateral_tolerance_pct": 0.5,
  "lateral_cycles_min": 5,
  "rise_trigger_pct": 1.0,
  "max_fall_pct": 8.0
}
```

**Resposta:**
```json
{
  "monitor_enabled": true,
  "check_interval_sec": 30,
  "lateral_tolerance_pct": 0.5,
  "lateral_cycles_min": 5,
  "rise_trigger_pct": 1.0,
  "rise_cycles_min": 2,
  "max_fall_pct": 8.0,
  "max_monitoring_time_min": 60,
  "cooldown_after_execution_min": 30
}
```

**Nota**: Apenas os campos enviados serão atualizados. Campos não enviados mantêm seus valores atuais.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "id": 1,
  "webhook_source_id": 1,
  "target_account_id": 1,
  "trade_mode": "REAL",
  "event_uid": "evt_1234567890_abc123",
  "symbol_raw": "SOLUSDT.P",
  "symbol_normalized": "SOLUSDT",
  "action": "BUY_SIGNAL",
  "timeframe": "H1",
  "price_reference": 213.09,
  "status": "JOB_CREATED",
  "raw_payload_json": { "text": "SOLUSDT.P Caça Fundo 🟢 (H1) Preço (213.09)" },
  "webhook_source": {
    "id": 1,
    "label": "TradingView Alerts"
  },
  "jobs_created": [
    {
      "id": 1,
      "status": "FILLED"
    }
  ],
  "jobs": [...],
  "created_at": "2025-02-12T10:00:00.000Z",
  "processed_at": "2025-02-12T10:00:01.000Z"
}
```

---

## Trade Jobs - Jobs de Trading

### `GET /trade-jobs`
Lista trade jobs do usuário.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `status` (opcional): Status do job
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `exchange_account_id` (opcional): ID da conta
- `symbol` (opcional): Símbolo do par
- `page` (opcional): Número da página
- `limit` (opcional): Itens por página

**Resposta (200):**
```json
{
  "data": [
    {
      "id": 1,
      "exchange_account_id": 1,
      "trade_mode": "REAL",
      "symbol": "BTCUSDT",
      "side": "BUY",
      "order_type": "MARKET",
      "quote_amount": 100,
      "status": "FILLED",
      "executions": [
        {
          "id": 1,
          "exchange_order_id": "12345",
          "executed_qty": 0.001,
          "avg_price": 50000
        }
      ],
      "created_at": "2025-02-12T10:00:00.000Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 100,
    "total_pages": 5
  }
}
```

### `GET /trade-jobs/:id`
Obtém detalhes de um trade job.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "id": 1,
  "exchange_account_id": 1,
  "trade_mode": "REAL",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "order_type": "MARKET",
  "quote_amount": 100,
  "status": "FILLED",
  "exchange_account": {
    "id": 1,
    "label": "Binance Spot Real"
  },
  "executions": [...],
  "position_open": {
    "id": 1,
    "status": "OPEN"
  },
  "webhook_event": {
    "id": 1,
    "event_uid": "evt_1234567890_abc123"
  },
  "created_at": "2025-02-12T10:00:00.000Z"
}
```

---

## Reports - Relatórios

### `GET /reports/pnl/summary`
Resumo de PnL (Profit and Loss).

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)
- `exchange_account_id` (opcional): ID da conta

**Resposta (200):**
```json
{
  "totalPnL": 150.50,
  "realizedPnL": 100.25,
  "unrealizedPnL": 50.25,
  "totalTrades": 25,
  "winningTrades": 15,
  "losingTrades": 10,
  "winRate": 60.0,
  "avgWin": 20.50,
  "avgLoss": -10.25
}
```

### `GET /reports/pnl/by-symbol`
PnL agrupado por símbolo.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)

**Resposta (200):**
```json
[
  {
    "symbol": "BTCUSDT",
    "totalPnL": 50.25,
    "realizedPnL": 30.10,
    "unrealizedPnL": 20.15,
    "totalTrades": 10,
    "winRate": 70.0
  }
]
```

### `GET /reports/pnl/by-day`
PnL agrupado por dia.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)

**Resposta (200):**
```json
[
  {
    "date": "2025-02-12",
    "totalPnL": 25.50,
    "realizedPnL": 20.00,
    "unrealizedPnL": 5.50,
    "tradesCount": 5
  }
]
```

### `GET /reports/open-positions/summary`
Resumo de posições abertas.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`

**Resposta (200):**
```json
{
  "totalPositions": 5,
  "totalUnrealizedPnL": 50.25,
  "totalInvested": 500.00,
  "bySymbol": [
    {
      "symbol": "BTCUSDT",
      "count": 2,
      "unrealizedPnL": 20.10
    }
  ]
}
```

### `GET /reports/vaults/summary`
Resumo de cofres.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)

**Resposta (200):**
```json
{
  "totalVaults": 2,
  "totalBalance": 2000.00,
  "totalDeposits": 2500.00,
  "totalWithdrawals": 500.00,
  "byAsset": [
    {
      "asset": "USDT",
      "totalBalance": 1500.00,
      "totalReserved": 100.00
    }
  ]
}
```

### `GET /reports/webhooks/summary`
Resumo de webhooks.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `webhook_source_id` (opcional): ID do webhook source
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)

**Resposta (200):**
```json
{
  "totalEvents": 100,
  "eventsProcessed": 95,
  "eventsSkipped": 3,
  "eventsFailed": 2,
  "jobsCreated": 90,
  "bySource": [
    {
      "webhook_source_id": 1,
      "label": "TradingView Alerts",
      "eventsCount": 50,
      "jobsCreated": 45
    }
  ]
}
```

### `GET /reports/strategy-performance`
Performance por estratégia.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)
- `webhook_source_id` (opcional): ID do webhook source

### `GET /reports/sharpe-ratio`
Sharpe Ratio.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)

### `GET /reports/symbol-correlation`
Correlação entre símbolos.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `trade_mode` (opcional): `REAL` ou `SIMULATION`
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)

---

## Notifications - Notificações

### `GET /notifications/config`
Obtém configuração de notificações do usuário.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "userId": 1,
  "enabled": true,
  "phone": "5511999999999",
  "events": {
    "positionOpened": true,
    "positionClosed": true,
    "positionSLHit": true,
    "positionTPHit": true,
    "tradeError": true
  }
}
```

### `PUT /notifications/config`
Atualiza configuração de notificações do usuário.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "enabled": true,
  "phone": "5511999999999",
  "events": {
    "positionOpened": true,
    "positionClosed": true,
    "positionSLHit": true,
    "positionTPHit": true,
    "tradeError": true
  }
}
```

### `GET /notifications/global-config` (Admin)
Obtém configuração global do WhatsApp.

**Headers:** `Authorization: Bearer <token>` (Admin)

**Resposta (200):**
```json
{
  "is_active": true,
  "api_url": "http://localhost:8080",
  "api_key": "sua-api-key",
  "instance_name": "trading-bot"
}
```

### `PUT /notifications/global-config` (Admin)
Atualiza configuração global do WhatsApp.

**Headers:** `Authorization: Bearer <token>` (Admin)

**Body:**
```json
{
  "is_active": true,
  "api_url": "http://localhost:8080",
  "api_key": "sua-api-key",
  "instance_name": "trading-bot"
}
```

### `POST /notifications/test-connection` (Admin)
Testa conexão com Evolution API.

**Headers:** `Authorization: Bearer <token>` (Admin)

**Resposta (200):**
```json
{
  "success": true,
  "message": "Conexão estabelecida com sucesso!"
}
```

### `GET /notifications/stats` (Admin)
Estatísticas de notificações.

**Headers:** `Authorization: Bearer <token>` (Admin)

**Resposta (200):**
```json
{
  "totalSent": 1000,
  "totalSuccess": 980,
  "totalFailed": 20,
  "byType": {
    "positionOpened": 200,
    "positionClosed": 150,
    "positionSLHit": 50,
    "positionTPHit": 100,
    "tradeError": 30
  },
  "last24Hours": 50
}
```

### `GET /notifications/history` (Admin)
Histórico de alertas enviados.

**Headers:** `Authorization: Bearer <token>` (Admin)

**Query Parameters:**
- `type` (opcional): Tipo de alerta
- `from` (opcional): Data inicial (ISO 8601)
- `to` (opcional): Data final (ISO 8601)
- `page` (opcional): Número da página
- `limit` (opcional): Itens por página

### `POST /notifications/send-test` (Admin)
Envia mensagem de teste.

**Headers:** `Authorization: Bearer <token>` (Admin)

**Body:**
```json
{
  "phone": "5511999999999",
  "message": "Mensagem de teste" // Opcional
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Mensagem enviada com sucesso!",
  "endpoint": "http://localhost:8080/message/sendText/trading-bot"
}
```

---

## Trade Parameters - Parâmetros de Trading

### `GET /trade-parameters`
Lista parâmetros de trading do usuário.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `exchange_account_id` (opcional): ID da conta
- `symbol` (opcional): Símbolo do par

**Resposta (200):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "exchange_account_id": 1,
    "symbol": "BTCUSDT",
    "side": "BOTH",
    "quote_amount_fixed": 100,
    "order_type_default": "MARKET",
    "default_sl_enabled": true,
    "default_sl_pct": 1.0,
    "default_tp_enabled": true,
    "default_tp_pct": 2.0,
    "exchange_account": {
      "id": 1,
      "label": "Binance Spot Real",
      "exchange": "BINANCE_SPOT"
    },
    "vault": {
      "id": 1,
      "name": "Cofre Real"
    }
  }
]
```

### `POST /trade-parameters`
Cria parâmetros de trading.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "exchange_account_id": 1,
  "symbol": "BTCUSDT",
  "side": "BOTH",
  "quote_amount_fixed": 100,
  "order_type_default": "MARKET",
  "default_sl_enabled": true,
  "default_sl_pct": 1.0,
  "default_tp_enabled": true,
  "default_tp_pct": 2.0,
  "vault_id": 1
}
```

### `GET /trade-parameters/:id`
Obtém detalhes de parâmetros de trading.

**Headers:** `Authorization: Bearer <token>`

### `PUT /trade-parameters/:id`
Atualiza parâmetros de trading.

**Headers:** `Authorization: Bearer <token>`

### `DELETE /trade-parameters/:id`
Deleta parâmetros de trading.

**Headers:** `Authorization: Bearer <token>`

---

## Monitoring - Monitoramento

### `GET /monitoring/health`
Health check do sistema.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "status": "ok",
  "services": {
    "api": "running",
    "executor": "running",
    "monitors": "running"
  },
  "database": "connected",
  "redis": "connected"
}
```

### `GET /monitoring/metrics`
Métricas do sistema.

**Headers:** `Authorization: Bearer <token>`

**Resposta (200):**
```json
{
  "cpu": 25.5,
  "memory": 512.0,
  "uptime": 86400,
  "services": {
    "api": {
      "status": "running",
      "cpu": 10.0,
      "memory": 256.0
    }
  }
}
```

---

## Admin - Administração

### `GET /admin/health`
Health check do sistema (Admin).

**Headers:** `Authorization: Bearer <token>` (Admin)

**Resposta (200):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-02-12T10:00:00.000Z"
}
```

### `GET /admin/metrics`
Métricas gerais do sistema (Admin).

**Headers:** `Authorization: Bearer <token>` (Admin)

**Resposta (200):**
```json
{
  "totalUsers": 10,
  "activeUsers": 8,
  "openPositions": 15,
  "totalTrades": 500,
  "timestamp": "2025-02-12T10:00:00.000Z"
}
```

### `GET /admin/stats`
Estatísticas do dashboard admin (Admin).

**Headers:** `Authorization: Bearer <token>` (Admin)

**Resposta (200):**
```json
{
  "totalUsers": 10,
  "activeUsers": 8,
  "activeSessions": 5,
  "auditEvents": 25,
  "uptime": "99.9%",
  "openPositions": 15,
  "totalTrades": 500,
  "recentActivity": [...],
  "alerts": []
}
```

---

## Rate Limiting

Atualmente, a API não implementa rate limiting global. Cada webhook source pode ter seu próprio rate limit configurado.

## CORS

CORS é configurado via variáveis de ambiente:
- `CORS_DISABLED=true` - Permite todas as origens (desenvolvimento)
- `CORS_ORIGIN=http://localhost:3000` - Lista de origens permitidas (produção)

---

**Última atualização**: 2025-02-20

