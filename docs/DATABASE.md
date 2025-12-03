# Modelo de Dados

Este documento descreve o schema do banco de dados, modelos principais, relacionamentos e convenções.

## Visão Geral

O banco de dados utiliza **MySQL 8** com **Prisma ORM** como camada de abstração. O schema é definido em `packages/db/prisma/schema.prisma`.

## Estrutura do Schema

### Usuários e Autenticação

#### `User`
Usuário principal do sistema.

```prisma
- id: Int (PK)
- email: String (unique)
- password_hash: String
- is_active: Boolean
- must_change_password: Boolean
- created_at, updated_at: DateTime
```

**Relacionamentos:**
- `profile` (1:1)
- `roles` (1:N)
- `login_history` (1:N)
- `audit_logs` (1:N)
- `exchange_accounts` (1:N)
- `vaults` (1:N)
- `webhook_sources` (1:N)
- `trade_parameters` (1:N)

#### `Profile`
Perfil do usuário com informações adicionais.

```prisma
- id: Int (PK)
- user_id: Int (FK, unique)
- full_name: String?
- phone: String?
- whatsapp_phone: String?
- position_alerts_enabled: Boolean
- twofa_enabled: Boolean
- twofa_secret: String?
- created_at, updated_at: DateTime
```

#### `UserRole`
Roles do usuário (admin, user).

```prisma
- id: Int (PK)
- user_id: Int (FK)
- role: String ('admin' | 'user')
- unique(user_id, role)
```

#### `LoginHistory`
Histórico de tentativas de login.

```prisma
- id: Int (PK)
- user_id: Int (FK)
- ip: String?
- user_agent: String?
- success: Boolean
- created_at: DateTime
```

#### `AuditLog`
Log de auditoria de ações do usuário.

```prisma
- id: Int (PK)
- user_id: Int? (FK, nullable)
- entity_type: String
- entity_id: Int?
- action: String
- changes_json: Json?
- ip, user_agent, request_id: String?
- created_at: DateTime
```

### Contas de Exchange

#### `ExchangeAccount`
Conta de exchange configurada pelo usuário.

```prisma
- id: Int (PK)
- user_id: Int (FK)
- exchange: String ('BINANCE_SPOT', 'BYBIT_SPOT', etc.)
- label: String
- is_simulation: Boolean
- api_key_enc: String? (criptografado)
- api_secret_enc: String? (criptografado)
- proxy_url: String?
- testnet: Boolean
- is_active: Boolean
- initial_balances_json: Json? (para simulação)
- created_at, updated_at: DateTime
```

**Relacionamentos:**
- `balances_cache` (1:N)
- `webhook_bindings` (1:N)
- `trade_parameters` (1:N)
- `trade_jobs` (1:N)
- `trade_executions` (1:N)
- `positions` (1:N)

#### `AccountBalanceCache`
Cache de saldos da exchange.

```prisma
- id: Int (PK)
- exchange_account_id: Int (FK)
- trade_mode: String ('REAL' | 'SIMULATION')
- asset: String
- free: Decimal
- locked: Decimal
- last_sync_at: DateTime?
- unique(exchange_account_id, trade_mode, asset)
```

### Cofres Virtuais

#### `Vault`
Cofre virtual para gerenciamento de capital.

```prisma
- id: Int (PK)
- user_id: Int (FK)
- name: String
- description: String?
- trade_mode: String ('REAL' | 'SIMULATION')
- is_active: Boolean
- created_at, updated_at: DateTime
```

**Relacionamentos:**
- `balances` (1:N)
- `transactions` (1:N)
- `trade_parameters` (1:N)

#### `VaultBalance`
Saldo de um ativo no cofre.

```prisma
- id: Int (PK)
- vault_id: Int (FK)
- asset: String
- balance: Decimal
- reserved: Decimal
- created_at, updated_at: DateTime
- unique(vault_id, asset)
```

#### `VaultTransaction`
Transação do cofre (depósito, saque, etc.).

```prisma
- id: Int (PK)
- vault_id: Int (FK)
- type: String ('DEPOSIT', 'WITHDRAWAL', 'BUY_RESERVE', etc.)
- asset: String
- amount: Decimal
- trade_job_id: Int?
- meta_json: Json?
- created_at: DateTime
```

### Parâmetros de Trading

#### `TradeParameter`
Parâmetros de trading por símbolo/conta.

```prisma
- id: Int (PK)
- user_id: Int (FK)
- exchange_account_id: Int (FK)
- symbol: String
- side: String ('BUY' | 'SELL' | 'BOTH')
- quote_amount_fixed: Decimal?
- quote_amount_pct_balance: Decimal?
- max_orders_per_hour: Int?
- min_interval_sec: Int?
- order_type_default: String ('MARKET' | 'LIMIT')
- slippage_bps: Int
- default_sl_enabled: Boolean
- default_sl_pct: Decimal?
- default_tp_enabled: Boolean
- default_tp_pct: Decimal?
- trailing_stop_enabled: Boolean
- trailing_distance_pct: Decimal?
- min_profit_pct: Decimal?
- vault_id: Int? (FK)
- created_at, updated_at: DateTime
```

### Webhooks

#### `WebhookSource`
Fonte de webhook (endpoint público).

```prisma
- id: Int (PK)
- owner_user_id: Int (FK)
- label: String
- webhook_code: String (unique)
- trade_mode: String ('REAL' | 'SIMULATION')
- allowed_ips_json: Json?
- require_signature: Boolean
- signing_secret_enc: String? (criptografado)
- rate_limit_per_min: Int
- is_active: Boolean
- admin_locked: Boolean
- alert_group_enabled: Boolean
- alert_group_id: String?
- created_at, updated_at: DateTime
```

**Relacionamentos:**
- `bindings` (1:N)
- `events` (1:N)
- `blocked_attempts` (1:N)

#### `AccountWebhookBinding`
Vinculação de webhook source com conta de exchange.

```prisma
- id: Int (PK)
- webhook_source_id: Int (FK)
- exchange_account_id: Int (FK)
- is_active: Boolean
- weight: Decimal? (distribuição de capital)
- created_at, updated_at: DateTime
- unique(webhook_source_id, exchange_account_id)
```

#### `WebhookEvent`
Evento recebido via webhook.

```prisma
- id: Int (PK)
- webhook_source_id: Int (FK)
- target_account_id: Int
- trade_mode: String
- event_uid: String (idempotência)
- symbol_raw: String
- symbol_normalized: String
- action: String ('BUY_SIGNAL' | 'SELL_SIGNAL' | 'UNKNOWN')
- timeframe: String?
- price_reference: Decimal?
- raw_text: String?
- raw_payload_json: Json?
- status: String ('RECEIVED', 'PROCESSED', 'FAILED')
- validation_error: String?
- created_at: DateTime
- processed_at: DateTime?
- unique(webhook_source_id, event_uid, target_account_id)
```

### Jobs e Execuções

#### `TradeJob`
Job de trading (intenção de compra/venda).

```prisma
- id: Int (PK)
- webhook_event_id: Int? (FK)
- exchange_account_id: Int (FK)
- trade_mode: String
- symbol: String
- side: String ('BUY' | 'SELL')
- order_type: String ('MARKET' | 'LIMIT')
- quote_amount: Decimal?
- base_quantity: Decimal?
- limit_price: Decimal?
- status: String ('PENDING', 'EXECUTING', 'FILLED', 'FAILED', etc.)
- reason_code: String?
- reason_message: String?
- vault_id: Int?
- limit_order_expires_at: DateTime?
- created_at, updated_at: DateTime
```

**Relacionamentos:**
- `executions` (1:N)
- `position_open` (1:1, se BUY)

#### `TradeExecution`
Execução de ordem na exchange.

```prisma
- id: Int (PK)
- trade_job_id: Int (FK)
- exchange_account_id: Int (FK)
- trade_mode: String
- exchange: String
- exchange_order_id: String?
- client_order_id: String
- status_exchange: String
- executed_qty: Decimal
- cumm_quote_qty: Decimal
- avg_price: Decimal
- fills_json: Json?
- raw_response_json: Json?
- created_at: DateTime
```

**Relacionamentos:**
- `position_fills` (1:N)

### Posições

#### `TradePosition`
Posição aberta ou fechada.

```prisma
- id: Int (PK)
- exchange_account_id: Int (FK)
- trade_mode: String
- symbol: String
- side: String ('LONG')
- trade_job_id_open: Int (FK, unique)
- qty_total: Decimal
- qty_remaining: Decimal
- price_open: Decimal
- status: String ('OPEN' | 'CLOSED')
- realized_profit_usd: Decimal
- sl_enabled: Boolean
- sl_pct: Decimal?
- tp_enabled: Boolean
- tp_pct: Decimal?
- trailing_enabled: Boolean
- trailing_distance_pct: Decimal?
- trailing_max_price: Decimal?
- min_profit_pct: Decimal?
- sl_triggered, tp_triggered, trailing_triggered: Boolean
- partial_tp_triggered: Boolean
- lock_sell_by_webhook: Boolean
- close_reason: String?
- closed_at: DateTime?
- created_at, updated_at: DateTime
```

**Relacionamentos:**
- `open_job` (1:1)
- `fills` (1:N)

#### `PositionFill`
Fill (execução parcial) de uma posição.

```prisma
- id: Int (PK)
- position_id: Int (FK)
- trade_execution_id: Int (FK)
- side: String ('BUY' | 'SELL')
- qty: Decimal
- price: Decimal
- created_at: DateTime
```

### Notificações

#### `WhatsAppGlobalConfig`
Configuração global do WhatsApp.

```prisma
- id: Int (PK)
- api_url: String
- api_key: String?
- instance_name: String
- is_active: Boolean
- created_at, updated_at: DateTime
```

#### `WhatsAppNotificationsConfig`
Configuração de notificações por usuário.

```prisma
- id: Int (PK)
- user_id: Int (unique)
- position_opened_enabled: Boolean
- position_closed_enabled: Boolean
- stop_loss_enabled: Boolean
- take_profit_enabled: Boolean
- vault_alerts_enabled: Boolean
- created_at, updated_at: DateTime
```

#### `WhatsAppNotificationLog`
Log de notificações enviadas.

```prisma
- id: Int (PK)
- template_type: String
- recipient: String
- recipient_type: String ('phone' | 'group')
- message: String?
- status: String ('sent' | 'failed')
- error_message: String?
- webhook_event_id: Int?
- position_id: Int?
- vault_id: Int?
- sent_at: DateTime
```

### Monitoramento

#### `SystemMonitoringLog`
Log de métricas do sistema.

```prisma
- id: Int (PK)
- timestamp: DateTime
- service_name: String ('API' | 'EXECUTOR' | 'MONITORS')
- process_id: Int?
- status: String ('running' | 'stopped' | 'error')
- cpu_usage: Decimal?
- memory_usage: Decimal?
- metrics_json: Json?
```

#### `SystemAlert`
Alerta do sistema.

```prisma
- id: Int (PK)
- alert_type: String
- severity: String ('low' | 'medium' | 'high' | 'critical')
- message: String
- service_name: String?
- metadata_json: Json?
- created_at: DateTime
- resolved_at: DateTime?
- resolved_by: Int? (user_id)
```

#### `CronJobConfig`
Configuração de job agendado.

```prisma
- id: Int (PK)
- name: String (unique)
- description: String
- queue_name: String
- job_id: String
- interval_ms: Int
- status: String ('ACTIVE' | 'PAUSED' | 'DISABLED')
- enabled: Boolean
- timeout_ms: Int?
- max_retries: Int
- config_json: Json?
- created_at, updated_at: DateTime
- updated_by: Int?
```

#### `CronJobExecution`
Execução de job agendado.

```prisma
- id: Int (PK)
- job_config_id: Int (FK)
- started_at: DateTime
- finished_at: DateTime?
- duration_ms: Int?
- status: String ('SUCCESS' | 'FAILED' | 'TIMEOUT' | 'RUNNING')
- result_json: Json?
- error_message: String?
- triggered_by: String ('SCHEDULED' | 'MANUAL')
```

## Índices

### Índices Principais

- `users.email` - Busca por email
- `users.is_active` - Filtro de usuários ativos
- `exchange_accounts.user_id` - Contas por usuário
- `exchange_accounts.is_simulation` - Filtro por modo
- `trade_positions.exchange_account_id, symbol, status` - Posições por conta/símbolo
- `trade_jobs.status` - Jobs por status
- `webhook_events.webhook_source_id, event_uid, target_account_id` - Idempotência
- `audit_logs.user_id, created_at` - Auditoria por usuário

## Migrations

### Executar Migrations

```bash
# Desenvolvimento (cria shadow database)
pnpm db:migrate

# Produção (sem shadow database)
pnpm db:migrate:deploy
```

### Criar Nova Migration

```bash
cd packages/db
pnpm prisma migrate dev --name nome_da_migration
```

## Convenções

### Nomes de Tabelas

- Plural em snake_case: `users`, `exchange_accounts`, `trade_positions`
- Mapeamento via `@@map()` no Prisma

### Tipos de Dados

- **IDs**: `Int` (auto-increment)
- **Valores Monetários**: `Decimal(36, 18)` para precisão
- **Percentuais**: `Decimal(5, 2)` para valores como 99.99%
- **Timestamps**: `DateTime` com `@default(now())` e `@updatedAt`
- **JSON**: `Json` para dados flexíveis

### Relacionamentos

- **1:1**: `@relation` com campo único
- **1:N**: `@relation` sem unique
- **N:N**: Tabela intermediária (ex: `AccountWebhookBinding`)

### Soft Deletes

- Não utilizado. Deletar registros remove do banco.
- Para auditoria, usar `AuditLog`.

## Backup e Recuperação

### Backup

```bash
# Backup completo
mysqldump -u usuario -p mvcashnode > backup.sql

# Backup apenas schema
mysqldump -u usuario -p --no-data mvcashnode > schema.sql
```

### Restauração

```bash
mysql -u usuario -p mvcashnode < backup.sql
```

---

**Última atualização**: 2025-02-12

