# Arquitetura do Sistema

Este documento descreve a arquitetura do Trading Automation Backend, incluindo a estrutura do monorepo, componentes principais, fluxos de dados e integrações.

## Visão Geral

O sistema é um **monorepo** gerenciado com `pnpm` que implementa uma arquitetura de microserviços modulares para automação de trading. A arquitetura separa responsabilidades em aplicações independentes e packages compartilhados.

## Estrutura do Monorepo

```
mvcashnode/
├── apps/
│   ├── api/              # API HTTP REST (NestJS)
│   ├── executor/         # Worker de execução de ordens
│   ├── monitors/         # Jobs agendados (SL/TP, sync, etc)
│   └── frontend/         # Frontend Next.js (opcional)
├── packages/
│   ├── db/               # Prisma Client e migrations
│   ├── domain/           # Regras de negócio
│   ├── exchange/         # Adapters CCXT
│   ├── notifications/    # Cliente WhatsApp
│   └── shared/           # Utilitários compartilhados
└── docs/                 # Documentação
```

## Componentes Principais

### 1. API Service (`apps/api`)

**Responsabilidades:**
- Expor endpoints REST para o frontend
- Autenticação e autorização (JWT + 2FA)
- CRUD de recursos (contas, cofres, webhooks, etc.)
- Endpoint público para recebimento de webhooks
- Documentação Swagger/OpenAPI

**Tecnologias:**
- NestJS (framework)
- Prisma (ORM)
- BullMQ (filas)
- Swagger (documentação)

**Endpoints Principais:**
- `/auth/*` - Autenticação
- `/exchange-accounts/*` - Contas de exchange
- `/vaults/*` - Cofres virtuais
- `/positions/*` - Posições
- `/webhooks/*` - Webhooks
- `/reports/*` - Relatórios
- `/admin/*` - Administração

### 2. Executor Service (`apps/executor`)

**Responsabilidades:**
- Processar jobs de trading da fila BullMQ
- Executar ordens em exchanges (modo REAL)
- Simular execução de ordens (modo SIMULATION)
- Atualizar status de jobs e execuções
- Criar/atualizar posições

**Filas BullMQ:**
- `trade-execution-real` - Ordens reais
- `trade-execution-sim` - Ordens simuladas

**Fluxo:**
1. Recebe job da fila
2. Valida dados do job
3. Executa ordem na exchange (REAL) ou simula (SIMULATION)
4. Atualiza banco de dados
5. Cria/atualiza posição se necessário
6. Notifica usuário (se configurado)

### 3. Monitors Service (`apps/monitors`)

**Responsabilidades:**
- Executar jobs agendados periodicamente
- Monitorar Stop Loss e Take Profit
- Sincronizar saldos das exchanges
- Monitorar ordens LIMIT pendentes
- Monitorar saúde do sistema

**Jobs Agendados:**
- **SL/TP Monitor** (a cada 30s):
  - Verifica posições abertas com SL/TP configurado
  - Executa ordens quando condições são atingidas
  - Separação por modo (REAL/SIMULATION)
  
- **Limit Orders Monitor** (a cada 60s):
  - Verifica ordens LIMIT pendentes
  - Cria ordens na exchange quando necessário
  - Atualiza status de ordens
  
- **Balances Sync** (a cada 5min):
  - Sincroniza saldos das exchanges
  - Atualiza cache de saldos
  
- **System Monitor** (a cada 30s):
  - Monitora saúde dos serviços
  - Gera alertas se necessário

## Packages Compartilhados

### `@mvcashnode/db`

**Responsabilidades:**
- Prisma Client gerado
- Schema do banco de dados
- Migrations
- Tipos TypeScript do banco

**Uso:**
- Importado por todos os apps e packages
- Fornece acesso tipado ao banco de dados

### `@mvcashnode/domain`

**Responsabilidades:**
- Regras de negócio puras
- Services de domínio:
  - `AuthService` - Autenticação
  - `UserService` - Gerenciamento de usuários
  - `ExchangeAccountService` - Contas de exchange
  - `VaultService` - Cofres virtuais
  - `PositionService` - Posições
  - `WebhookService` - Webhooks
  - `TradeParameterService` - Parâmetros de trading

**Características:**
- Independente de frameworks
- Testável isoladamente
- Reutilizável entre apps

### `@mvcashnode/exchange`

**Responsabilidades:**
- Adapters para exchanges (CCXT)
- Factory pattern para criar adapters
- Normalização de dados entre exchanges
- Suporte a múltiplas exchanges (Binance, Bybit, etc.)

**Adapters:**
- `BinanceAdapter` - Binance Spot
- `BybitAdapter` - Bybit Spot
- Extensível para outras exchanges

### `@mvcashnode/notifications`

**Responsabilidades:**
- Cliente WhatsApp (Evolution API)
- Templates de notificações
- Envio de alertas
- Configuração global e por usuário

### `@mvcashnode/shared`

**Responsabilidades:**
- Logger centralizado
- Utilitários de criptografia
- Tipos compartilhados
- Validações
- Serviços de tempo (NTP, Timezone)
- Monitoramento de processos

## Fluxo de Dados

### Fluxo de Webhook para Trade

```
1. Webhook recebido → /webhooks/:code
2. Validação (IP, assinatura, rate limit)
3. Parsing do sinal (WebhookParserService)
4. Criação de WebhookEvent
5. Busca de bindings (AccountWebhookBinding)
6. Para cada binding:
   a. Cria TradeJob
   b. Enfileira na fila BullMQ
   c. Executor processa job
   d. Execução na exchange (ou simulação)
   e. Criação/atualização de posição
   f. Notificação (se configurado)
```

### Fluxo de Execução de Ordem

```
1. TradeJob criado (status: PENDING)
2. Job enfileirado na fila BullMQ
3. Executor pega job da fila
4. Validação de parâmetros
5. Execução:
   - REAL: Chama exchange via CCXT
   - SIMULATION: Simula execução
6. Criação de TradeExecution
7. Atualização de TradeJob (status: FILLED/FAILED)
8. Se BUY: Cria TradePosition
9. Se SELL: Atualiza TradePosition (fecha parcial ou total)
10. Atualização de saldos (Vault ou Exchange)
```

### Fluxo de Monitoramento SL/TP

```
1. Monitor job executa (a cada 30s)
2. Busca posições abertas com SL/TP
3. Para cada posição:
   a. Busca preço atual da exchange
   b. Calcula PnL percentual
   c. Verifica se SL/TP foi atingido
   d. Se sim: Cria TradeJob de venda
   e. Enfileira na fila
   f. Executor processa (mesmo fluxo acima)
```

## Integrações Externas

### MySQL 8

**Uso:**
- Banco de dados principal
- Armazena todos os dados persistentes
- Acessado via Prisma ORM

**Configuração:**
- URL via `DATABASE_URL`
- Suporte a shadow database para migrations

### Redis

**Uso:**
- Backend para BullMQ (filas)
- Cache (opcional)
- Rate limiting (opcional)

**Configuração:**
- Host/Port via `REDIS_HOST` e `REDIS_PORT`
- Senha via `REDIS_PASSWORD` (opcional)

### Evolution API (WhatsApp)

**Uso:**
- Envio de notificações WhatsApp
- Alertas de posições
- Notificações de erros

**Configuração:**
- URL via `WHATSAPP_API_URL` (ou config global)
- API Key (opcional)
- Instance name

### Exchanges (via CCXT)

**Uso:**
- Execução de ordens (modo REAL)
- Busca de preços
- Sincronização de saldos
- Consulta de ordens

**Suporte:**
- Binance Spot
- Bybit Spot
- Extensível para outras

## Segurança

### Autenticação

- **JWT**: Tokens de acesso e refresh
- **2FA**: TOTP (Time-based One-Time Password)
- **Guards**: JwtAuthGuard, RolesGuard

### Criptografia

- **Credenciais de Exchange**: Criptografadas antes de armazenar
- **Secrets de Webhook**: Criptografados
- **Chave de Criptografia**: Via `ENCRYPTION_KEY` (32 bytes)

### Validação de Webhooks

- **IP Whitelist**: Lista de IPs permitidos
- **Assinatura HMAC**: Validação de integridade
- **Rate Limiting**: Limite de requisições por minuto
- **Idempotência**: Prevenção de duplicação via `event_uid`

## Escalabilidade

### Horizontal

- **API**: Múltiplas instâncias (stateless)
- **Executor**: Múltiplos workers (BullMQ distribui jobs)
- **Monitors**: Apenas uma instância (jobs repetitivos)

### Vertical

- **Cache**: Redis para reduzir carga no banco
- **Índices**: Otimização de queries no Prisma
- **Paginação**: Endpoints retornam dados paginados

## Monitoramento

### Métricas Coletadas

- **Sistema**: CPU, memória, uptime
- **Serviços**: Status, process ID
- **Trading**: Jobs processados, erros, latência

### Logs

- **Aplicação**: Logs estruturados em `/logs`
- **Erros**: Logs de erro separados
- **Auditoria**: AuditLog para ações importantes

## Desenvolvimento

### Hot Reload

- **API**: `nest start --watch`
- **Executor/Monitors**: Reinício manual necessário

### Testes

- **Unit**: Jest
- **E2E**: Supertest
- **Cobertura**: Configurável via Jest

## Deploy

### Produção

- **Build**: `pnpm build` compila TypeScript
- **Start**: `pnpm start` executa serviços
- **PM2**: Recomendado para gerenciar processos
- **Docker**: Suporte opcional

### Variáveis de Ambiente

Ver [SETUP.md](./SETUP.md) para lista completa de variáveis.

---

**Última atualização**: 2025-02-12

