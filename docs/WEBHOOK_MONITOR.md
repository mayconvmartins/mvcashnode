# Módulo Monitor Webhook

## Visão Geral

O Módulo Monitor Webhook é um sistema inteligente que transforma alertas de webhook em "candidatos" monitorados, rastreando preços em tempo real antes de executar compras. Em vez de executar imediatamente quando um alerta chega, o sistema monitora o preço do ativo e aguarda o melhor momento de entrada baseado em análise de queda/lateralização/alta do preço.

## Conceito Principal

Para cada par (ex: `SOLUSDT`), o sistema mantém **no máximo 1 alerta ativo** em estado de monitoramento. Este alerta guarda:

- **Preço do alerta**: Preço original recebido no webhook
- **Preço mínimo**: Menor preço visto desde o alerta
- **Preço atual**: Último preço verificado
- **Estado**: `MONITORING` | `EXECUTED` | `CANCELLED`
- **Ciclos sem novo fundo**: Contador de verificações sem fazer novo mínimo

O sistema **não compra na hora** que o alerta chega. Em vez disso:

> "Recebi um alerta de compra → vou começar a seguir esse ativo de perto e tentar pegar ele o mais perto possível do fundo local."

## Fluxo de Funcionamento

### 1. Recebimento de Alerta

Quando um webhook é recebido com `monitor_enabled = true` e `action = BUY_SIGNAL`:

#### Situação A: Não existe alerta ativo para aquele par

1. Cria um **alerta ativo**:
   - `preço_alerta = preço do alerta`
   - `preço_mínimo = preço do alerta`
   - `estado = MONITORING`
2. Inicia monitoramento a cada 30 segundos

#### Situação B: Já existe alerta ativo para aquele par

O sistema compara os preços:

- **Se o novo alerta é mais barato** que o `preço_mínimo` atual:
  - Substitui o alerta antigo pelo novo
  - Atualiza `preço_alerta` e `preço_mínimo` para o novo valor
  - Zera contadores de lateralização/alta
  - Continua monitorando a partir do novo nível

- **Se o novo alerta é mais caro ou igual**:
  - Ignora o novo alerta
  - Continua usando o alerta atual (que tem preço melhor)

> **Regra**: Sempre que vier um alerta mais barato que o que está sendo acompanhado, o sistema "troca o alvo" para o mais barato.

### 2. Loop de Monitoramento (30 em 30 segundos)

O sistema consulta a Binance a cada 30 segundos. Para cada par com alerta ativo em `MONITORING`:

1. Lê o **preço atual de mercado** (usando cache do price-sync ou buscando diretamente)
2. Atualiza o **preço mínimo**:
   - Se o preço atual for **menor** que o `preço_mínimo`, atualiza e zera contador
   - Se não, incrementa contador de ciclos sem novo fundo
3. Classifica o momento em uma das 3 situações:

#### 2.1. "Ainda caindo" (FALLING)

Considera que ainda está caindo quando:
- O preço atual fez novo fundo (`preço_atual < preço_mínimo anterior`), ou
- Ainda não atingiu condições de lateralização ou alta

**Ação**: Não compra, apenas continua monitorando.

#### 2.2. "Lateralizando" (LATERAL)

Considera **lateral** quando:
- O preço fica dentro de uma faixa pequena em relação ao `preço_mínimo`:
  - Exemplo: entre `preço_mínimo` e `preço_mínimo + 0,3%` (configurável)
- E não aparece novo fundo por um período mínimo:
  - Exemplo: 3-5 ciclos sem novo fundo (configurável)

**Leitura**: "Parou de despencar, está segurando num patamar."

**Ação**: Se está lateral há ciclos suficientes → **executa a compra**.

#### 2.3. "Iniciando alta" (RISING)

Considera **início de alta** quando:
- O preço atual está **acima do `preço_mínimo` por uma margem**, ex.:
  - `preço_atual >= preço_mínimo * (1 + 0,75%)` (configurável)
- E já se passaram alguns ciclos (ex.: 2-3 checks de 30s) sem fazer novo fundo

**Leitura**: "Fez um fundo e começou a reagir."

**Ação**: Se subiu o suficiente e já passou ciclos mínimos → **executa a compra**.

### 3. Execução da Compra

A compra é executada quando **qualquer uma** das condições é atendida:

- **Regra 1**: Preço está **lateral** há X ciclos (configurável)
- **Regra 2**: Preço **subiu Y%** a partir do mínimo (configurável)

Após executar:
- Marca o alerta como `EXECUTED`
- Cria o `TradeJob` normalmente (usando `TradeJobService`)
- Aplica cooldown no par (não aceita novos alertas por X minutos)

### 4. Proteções Implementadas

#### 4.1. Limite de Queda Máxima

Se desde o `preço_alerta` até o `preço_mínimo` já caiu mais que X% (padrão: 6%):

- Cancela o alerta (marca como `CANCELLED`)
- Motivo: "Queda máxima excedida: X% > Y%"

#### 4.2. Tempo Máximo de Monitoramento

Se o alerta está sendo monitorado há mais de X minutos (padrão: 60min):

- Cancela o alerta
- Motivo: "Tempo máximo de monitoramento excedido"

#### 4.3. Cooldown Após Execução

Após executar uma compra, o sistema aplica um cooldown:

- Por X minutos (padrão: 30min), não aceita novos alertas no mesmo par
- Evita reentrar em faca que continua caindo

#### 4.4. Um Alerta por Par

Máximo 1 alerta ativo por combinação de:
- `exchange_account_id`
- `symbol`
- `trade_mode`

## Estrutura do Banco de Dados

### Tabela: `webhook_monitor_alerts`

Armazena alertas ativos sendo monitorados:

```sql
- id (PK)
- webhook_source_id (FK)
- webhook_event_id (FK)
- exchange_account_id (FK)
- symbol (VARCHAR(50))
- trade_mode (VARCHAR(20))
- price_alert (DECIMAL(36, 18)) -- Preço do alerta original
- price_minimum (DECIMAL(36, 18)) -- Menor preço visto
- current_price (DECIMAL(36, 18)) -- Preço atual
- state (VARCHAR(50)) -- 'MONITORING' | 'EXECUTED' | 'CANCELLED'
- cycles_without_new_low (INT) -- Contador de ciclos sem novo fundo
- last_price_check_at (DATETIME)
- executed_trade_job_id (INT, nullable) -- ID do TradeJob quando executado
- cancel_reason (TEXT, nullable)
- created_at, updated_at
```

**Índices**:
- `(exchange_account_id, symbol, trade_mode, state)` - Busca rápida de alertas ativos
- `(state)` - Filtro por estado
- `(created_at)` - Ordenação temporal

### Tabela: `webhook_monitor_config`

Configurações de monitoramento (global ou por usuário):

```sql
- id (PK)
- user_id (INT, nullable, UNIQUE) -- null = configuração global
- monitor_enabled (BOOLEAN, default: true)
- check_interval_sec (INT, default: 30)
- lateral_tolerance_pct (DECIMAL(5,2), default: 0.30)
- lateral_cycles_min (INT, default: 4)
- rise_trigger_pct (DECIMAL(5,2), default: 0.75)
- rise_cycles_min (INT, default: 2)
- max_fall_pct (DECIMAL(5,2), default: 6.00)
- max_monitoring_time_min (INT, default: 60)
- cooldown_after_execution_min (INT, default: 30)
- created_at, updated_at
```

### Modificação: `webhook_sources`

Adicionado campo:
- `monitor_enabled` (BOOLEAN, default: false) - Seletor no webhook para ativar monitoramento

## Configurações

### Parâmetros Ajustáveis

Todos os parâmetros podem ser configurados na interface (`/webhooks/monitor` → aba "Parâmetros"):

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `check_interval_sec` | 30 | Intervalo entre verificações de preço (segundos) |
| `lateral_tolerance_pct` | 0.3% | Margem para considerar preço lateral |
| `lateral_cycles_min` | 4 | Ciclos sem novo fundo para executar em lateral |
| `rise_trigger_pct` | 0.75% | Percentual de alta a partir do mínimo para executar |
| `rise_cycles_min` | 2 | Ciclos mínimos após alta para executar |
| `max_fall_pct` | 6% | Queda máxima desde o alerta para cancelar |
| `max_monitoring_time_min` | 60 | Tempo máximo de monitoramento (minutos) |
| `cooldown_after_execution_min` | 30 | Cooldown após execução (minutos) |

### Configuração Global vs. por Usuário

- **Configuração Global** (`user_id = null`): Aplicada a todos os usuários que não têm configuração própria
- **Configuração por Usuário**: Cada usuário pode ter suas próprias configurações, que sobrescrevem a global

## API Endpoints

### Listar Alertas Ativos

```http
GET /webhooks/monitor/alerts
Authorization: Bearer {token}
```

Retorna lista de alertas em estado `MONITORING`.

### Obter Detalhes de Alerta

```http
GET /webhooks/monitor/alerts/:id
Authorization: Bearer {token}
```

Retorna detalhes completos de um alerta específico.

### Cancelar Alerta Manualmente

```http
POST /webhooks/monitor/alerts/:id/cancel
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Cancelado manualmente pelo usuário"
}
```

Cancela um alerta em estado `MONITORING`.

### Listar Histórico

```http
GET /webhooks/monitor/history?symbol=BTCUSDT&state=EXECUTED&limit=50
Authorization: Bearer {token}
```

Parâmetros de query:
- `symbol` (opcional): Filtrar por símbolo
- `state` (opcional): `EXECUTED` ou `CANCELLED`
- `startDate` (opcional): Data inicial (ISO string)
- `endDate` (opcional): Data final (ISO string)
- `limit` (opcional): Limite de resultados (padrão: 100)

### Obter Configurações

```http
GET /webhooks/monitor/config
Authorization: Bearer {token}
```

Retorna configurações do usuário (ou global se não houver configuração do usuário).

### Atualizar Configurações

```http
PUT /webhooks/monitor/config
Authorization: Bearer {token}
Content-Type: application/json

{
  "lateral_tolerance_pct": 0.5,
  "lateral_cycles_min": 5,
  "rise_trigger_pct": 1.0,
  ...
}
```

Atualiza configurações do usuário (cria se não existir).

## Interface do Usuário

### Página: `/webhooks/monitor`

A página possui 3 abas:

#### Aba "Monitor Ativo"

Lista de símbolos sendo monitorados em tempo real:

- **Tabela com colunas**:
  - Símbolo (com ícone de tendência: caindo/lateral/subindo)
  - Preço Alerta
  - Preço Mínimo (em verde)
  - Preço Atual
  - Estado (badge colorido)
  - Ciclos sem novo fundo
  - Criado em
  - Ações (botão para cancelar)

- **Atualização automática**: A cada 10 segundos
- **Cards visuais**: Status de cada alerta (caindo/lateral/subindo)

#### Aba "Parâmetros"

Formulário com todos os parâmetros ajustáveis:

- Grid responsivo com campos organizados
- Validação de ranges (min/max)
- Descrições explicativas para cada parâmetro
- Botão "Salvar Configurações"

#### Aba "Histórico"

Tabela de alertas já executados ou cancelados:

- Filtros por símbolo, estado, data
- Detalhes de cada execução/cancelamento
- Motivo do cancelamento (quando aplicável)

## Integração com Sistema Existente

### Aproveitamento do Price Sync

O monitor utiliza o cache de preços do `price-sync` processor:

- Busca preço do cache primeiro (chave: `price:{exchange}:{symbol}`)
- Se não estiver no cache, busca diretamente da exchange
- Armazena no cache com TTL de 25 segundos

### WebSocket para Atualizações em Tempo Real

O sistema emite eventos WebSocket:

- `webhook-monitor.alert-updated`: Quando preço é atualizado
- `webhook-monitor.alert-executed`: Quando compra é executada
- `webhook-monitor.alert-cancelled`: Quando alerta é cancelado

### Cron Job de Monitoramento

O job `webhook-monitor` roda a cada 30 segundos:

- Processa todos os alertas em estado `MONITORING`
- Busca preços, atualiza estados, verifica condições
- Executa ou cancela conforme necessário
- Registrado no sistema de monitoramento (`/monitoring`)

## Exemplo de Fluxo Completo

### Cenário: Alerta de SOLUSDT

1. **10:00:00** - Webhook recebido: `BUY_SIGNAL SOLUSDT @ $100`
   - Alerta criado: `price_alert = $100`, `price_minimum = $100`, `state = MONITORING`

2. **10:00:30** - Primeira verificação: Preço = $98
   - Atualiza: `price_minimum = $98`, `cycles_without_new_low = 0`
   - Estado: FALLING (ainda caindo)

3. **10:01:00** - Segunda verificação: Preço = $96
   - Atualiza: `price_minimum = $96`, `cycles_without_new_low = 0`
   - Estado: FALLING

4. **10:01:30** - Terceira verificação: Preço = $95
   - Atualiza: `price_minimum = $95`, `cycles_without_new_low = 0`
   - Estado: FALLING

5. **10:02:00** - Quarta verificação: Preço = $95.20
   - Não atualiza mínimo (preço subiu)
   - `cycles_without_new_low = 1`
   - Estado: LATERAL (dentro de 0.3% do mínimo)

6. **10:02:30** - Quinta verificação: Preço = $95.15
   - `cycles_without_new_low = 2`
   - Estado: LATERAL

7. **10:03:00** - Sexta verificação: Preço = $95.25
   - `cycles_without_new_low = 3`
   - Estado: LATERAL

8. **10:03:30** - Sétima verificação: Preço = $95.30
   - `cycles_without_new_low = 4`
   - Estado: LATERAL
   - **Condição atendida**: Lateral há 4 ciclos (>= `lateral_cycles_min`)
   - **EXECUTA COMPRA**: Cria TradeJob e marca como `EXECUTED`

### Cenário: Múltiplos Alertas

1. **10:00:00** - Alerta 1: SOLUSDT @ $100
   - Alerta criado, `price_minimum = $100`

2. **10:05:00** - Alerta 2: SOLUSDT @ $95 (mais barato)
   - Alerta 1 cancelado: "Substituído por alerta mais barato"
   - Alerta 2 criado: `price_minimum = $95`

3. **10:10:00** - Alerta 3: SOLUSDT @ $98 (mais caro)
   - Alerta 3 ignorado (mais caro que o mínimo atual de $95)
   - Continua monitorando Alerta 2

## Proteções e Segurança

### Validações

- Apenas alertas `BUY_SIGNAL` são monitorados
- `price_reference` deve estar presente no webhook
- Trade mode deve corresponder entre webhook e conta
- Um alerta por par (símbolo + conta + modo)

### Cooldown

Após executar uma compra, o sistema não aceita novos alertas no mesmo par por X minutos (configurável). Isso evita:

- Reentrar em faca que continua caindo
- Múltiplas compras muito próximas no mesmo ativo

### Limites de Proteção

- **Queda máxima**: Se o preço cair mais que X% desde o alerta, cancela automaticamente
- **Tempo máximo**: Se monitorando há mais de X minutos, cancela automaticamente

## Monitoramento e Logs

### Logs do Sistema

O sistema gera logs detalhados:

```
[WEBHOOK-MONITOR] Alerta criado: ID=123, símbolo=SOLUSDT, preço=100
[WEBHOOK-MONITOR] Alerta 123 ainda em monitoramento (preço: 95.30, mínimo: 95.00)
[WEBHOOK-MONITOR] Alerta 123 executado para SOLUSDT
[WEBHOOK-MONITOR] Alerta 123 cancelado: Queda máxima excedida: 8.5% > 6%
```

### Métricas do Cron Job

O job aparece na página `/monitoring` com:

- Status (ACTIVE/PAUSED/DISABLED)
- Última execução
- Estatísticas (checked, executed, cancelled, errors)
- Histórico de execuções

## Troubleshooting

### Alerta não está sendo criado

Verificar:
1. Webhook tem `monitor_enabled = true`?
2. Alerta é `BUY_SIGNAL`?
3. `price_reference` está presente no webhook?
4. Trade mode corresponde entre webhook e conta?

### Alerta não está executando

Verificar:
1. Preço está lateral há ciclos suficientes?
2. Preço subiu o percentual necessário?
3. Proteções não foram ativadas (queda máxima, tempo máximo)?
4. Configurações estão corretas?

### Alerta sendo cancelado automaticamente

Verificar:
1. Queda máxima excedida? Ajustar `max_fall_pct`
2. Tempo máximo excedido? Ajustar `max_monitoring_time_min`
3. Verificar logs para motivo específico

## Migração do Banco de Dados

Para aplicar as mudanças no banco:

```bash
# Desenvolvimento
pnpm db:migrate

# Produção
pnpm db:migrate:deploy
```

A migration `20250220000000_add_webhook_monitor` cria:
- Tabela `webhook_monitor_alerts`
- Tabela `webhook_monitor_config`
- Campo `monitor_enabled` em `webhook_sources`
- Índices apropriados

## Arquivos Principais

### Backend

- `packages/domain/src/webhooks/webhook-monitor.service.ts` - Lógica de negócio
- `apps/monitors/src/webhook-monitor/processors/webhook-monitor.processor.ts` - Job de monitoramento
- `apps/api/src/webhooks/webhook-monitor.controller.ts` - Endpoints da API
- `packages/db/prisma/migrations/20250220000000_add_webhook_monitor/migration.sql` - Migration

### Frontend

- `apps/frontend/src/app/(dashboard)/webhooks/monitor/page.tsx` - Página principal
- `apps/frontend/src/components/webhooks/WebhookMonitorConfigForm.tsx` - Formulário de configuração
- `apps/frontend/src/lib/api/webhook-monitor.service.ts` - Serviço de API

## Referências

- [Documentação de Trading](./TRADING.md) - Sistema de trading geral
- [Documentação de Webhooks](./API.md#webhooks) - Sistema de webhooks
- [Documentação de Monitoramento](./MONITORING_API.md) - Sistema de monitoramento de cron jobs

---

**Última atualização**: 2025-02-20

