# Módulo Monitor Webhook

## Visão Geral

O Módulo Monitor Webhook é um sistema inteligente que transforma alertas de webhook em "candidatos" monitorados, rastreando preços em tempo real antes de executar compras ou vendas. Em vez de executar imediatamente quando um alerta chega, o sistema monitora o preço do ativo e aguarda o melhor momento de entrada/saída baseado em análise de tendência de preço.

**Suporta dois tipos de monitoramento:**
- **BUY (Compra)**: Monitora enquanto cai, executa quando para de cair (lateraliza/sobe)
- **SELL (Venda)**: Monitora enquanto sobe, executa quando para de subir (lateraliza/cai)

## Conceito Principal

Para cada par (ex: `SOLUSDT`) e tipo (BUY ou SELL), o sistema mantém **no máximo 1 alerta ativo** em estado de monitoramento por webhook. Este alerta guarda:

- **Preço do alerta**: Preço original recebido no webhook
- **Preço mínimo** (BUY): Menor preço visto desde o alerta
- **Preço máximo** (SELL): Maior preço visto desde o alerta
- **Preço atual**: Último preço verificado
- **Preço de execução**: Preço quando foi executado (apenas para EXECUTED)
- **Estado**: `MONITORING` | `EXECUTED` | `CANCELLED`
- **Status de monitoramento**: `FALLING` | `LATERAL` | `RISING`
- **Ciclos sem novo fundo/topo**: Contador de verificações sem fazer novo mínimo/máximo
- **Motivo de saída**: Detalhes de por que saiu do monitoramento

O sistema **não executa na hora** que o alerta chega. Em vez disso:

> **BUY**: "Recebi um alerta de compra → vou começar a seguir esse ativo de perto e tentar pegar ele o mais perto possível do fundo local."
> 
> **SELL**: "Recebi um alerta de venda → vou começar a seguir esse ativo de perto e tentar vender ele o mais próximo possível do topo local."

## Fluxo de Funcionamento

### 1. Recebimento de Alerta

Quando um webhook é recebido com `monitor_enabled = true` e `action = BUY_SIGNAL` ou `SELL_SIGNAL`:

#### Situação A: Não existe alerta ativo para aquele par

1. Cria um **alerta ativo**:
   - `preço_alerta = preço do alerta`
   - `preço_mínimo = preço do alerta`
   - `estado = MONITORING`
2. Inicia monitoramento a cada 30 segundos

#### Situação B: Já existe alerta ativo para aquele par

O sistema compara os preços baseado no tipo (BUY ou SELL):

**Para BUY:**
- **Se o novo alerta é mais barato** que o `preço_mínimo` atual:
  - Substitui o alerta antigo pelo novo
  - Atualiza `preço_alerta` e `preço_mínimo` para o novo valor
  - Zera contadores de lateralização/alta
  - Continua monitorando a partir do novo nível

- **Se o novo alerta é mais caro ou igual**:
  - Ignora o novo alerta
  - Continua usando o alerta atual (que tem preço melhor)

**Para SELL:**
- **Se o novo alerta é mais alto** que o `preço_máximo` atual:
  - Substitui o alerta antigo pelo novo
  - Atualiza `preço_alerta` e `preço_máximo` para o novo valor
  - Zera contadores de lateralização/queda
  - Continua monitorando a partir do novo nível

- **Se o novo alerta é mais baixo ou igual**:
  - Ignora o novo alerta
  - Continua usando o alerta atual (que tem preço melhor)

> **Regra BUY**: Sempre que vier um alerta mais barato que o que está sendo acompanhado, o sistema "troca o alvo" para o mais barato.
> 
> **Regra SELL**: Sempre que vier um alerta mais alto que o que está sendo acompanhado, o sistema "troca o alvo" para o mais alto.

### 2. Loop de Monitoramento (30 em 30 segundos)

O sistema consulta o cache de preços (prioritariamente Binance) a cada 30 segundos. Para cada par com alerta ativo em `MONITORING`:

1. Lê o **preço atual de mercado** (usando cache do price-sync ou buscando diretamente da Binance)
2. Atualiza o **preço mínimo/máximo** baseado no tipo:
   - **BUY**: Se o preço atual for **menor** que o `preço_mínimo`, atualiza e zera contador
   - **SELL**: Se o preço atual for **maior** que o `preço_máximo`, atualiza e zera contador
   - Se não, incrementa contador de ciclos sem novo fundo/topo
3. Classifica o momento em uma das 3 situações:

#### 2.1. "Ainda caindo/subindo" (FALLING/RISING)

**Para BUY (FALLING):**
- Considera que ainda está caindo quando:
  - O preço atual fez novo fundo (`preço_atual < preço_mínimo anterior`), ou
  - Ainda não atingiu condições de lateralização ou alta

**Para SELL (RISING):**
- Considera que ainda está subindo quando:
  - O preço atual fez novo topo (`preço_atual > preço_máximo anterior`), ou
  - Ainda não atingiu condições de lateralização ou queda

**Ação**: Não executa, apenas continua monitorando.

#### 2.2. "Lateralizando" (LATERAL)

**Para BUY:**
- Considera **lateral** quando:
  - O preço fica dentro de uma faixa pequena em relação ao `preço_mínimo`:
    - Exemplo: entre `preço_mínimo` e `preço_mínimo + 0,3%` (configurável)
  - E não aparece novo fundo por um período mínimo:
    - Exemplo: 3-5 ciclos sem novo fundo (configurável)

**Para SELL:**
- Considera **lateral** quando:
  - O preço fica dentro de uma faixa pequena em relação ao `preço_máximo`:
    - Exemplo: entre `preço_máximo - 0,3%` e `preço_máximo` (configurável)
  - E não aparece novo topo por um período mínimo:
    - Exemplo: 3-5 ciclos sem novo topo (configurável)

**Leitura**: "Parou de despencar/subir, está segurando num patamar."

**Ação**: Se está lateral há ciclos suficientes → **executa a operação**.

#### 2.3. "Iniciando alta/queda" (RISING/FALLING)

**Para BUY (RISING):**
- Considera **início de alta** quando:
  - O preço atual está **acima do `preço_mínimo` por uma margem**, ex.:
    - `preço_atual >= preço_mínimo * (1 + 0,75%)` (configurável)
  - E já se passaram alguns ciclos (ex.: 2-3 checks de 30s) sem fazer novo fundo

**Leitura**: "Fez um fundo e começou a reagir."

**Ação**: Se subiu o suficiente e já passou ciclos mínimos → **executa a compra**.

**Para SELL (FALLING):**
- Considera **início de queda** quando:
  - O preço atual está **abaixo do `preço_máximo` por uma margem**, ex.:
    - `preço_atual <= preço_máximo * (1 - 0,5%)` (configurável)
  - E já se passaram alguns ciclos (ex.: 2-3 checks de 30s) sem fazer novo topo

**Leitura**: "Fez um topo e começou a cair."

**Ação**: Se caiu o suficiente e já passou ciclos mínimos → **executa a venda**.

### 3. Execução da Operação

A operação é executada quando **qualquer uma** das condições é atendida:

**Para BUY:**
- **Regra 1**: Preço está **lateral** há X ciclos (configurável)
- **Regra 2**: Preço **subiu Y%** a partir do mínimo (configurável)

**Para SELL:**
- **Regra 1**: Preço está **lateral** há X ciclos (configurável)
- **Regra 2**: Preço **caiu Y%** a partir do máximo (configurável)

Após executar:
- Marca o alerta como `EXECUTED`
- Armazena preço de execução e detalhes (ex: "Lateralizado por 5 ciclos", "Em alta por 3 ciclos")
- Cria `TradeJob`s para todas as contas vinculadas ao webhook (usando `TradeJobService`)
- Armazena todos os IDs dos jobs criados
- Aplica cooldown no par (não aceita novos alertas por X minutos)

### 4. Proteções Implementadas

#### 4.1. Limite de Queda/Alta Máxima

**Para BUY:**
- Se desde o `preço_alerta` até o `preço_mínimo` já caiu mais que X% (padrão: 6%):
  - Cancela o alerta (marca como `CANCELLED`)
  - Motivo: "Queda máxima excedida: X% > Y%"

**Para SELL:**
- Se desde o `preço_alerta` até o `preço_máximo` já subiu mais que X% (padrão: 6%):
  - Cancela o alerta (marca como `CANCELLED`)
  - Motivo: "Alta máxima excedida: X% > Y%"

#### 4.2. Tempo Máximo de Monitoramento

Se o alerta está sendo monitorado há mais de X minutos (padrão: 60min):

- Cancela o alerta
- Motivo: "Tempo máximo de monitoramento excedido"

#### 4.3. Cooldown Após Execução

Após executar uma compra, o sistema aplica um cooldown:

- Por X minutos (padrão: 30min), não aceita novos alertas no mesmo par
- Evita reentrar em faca que continua caindo

#### 4.4. Um Alerta por Webhook

Máximo 1 alerta ativo por combinação de:
- `webhook_source_id` (não mais por conta)
- `symbol`
- `trade_mode`
- `side` (BUY ou SELL)

**Importante**: O monitoramento acontece ANTES de vincular a contas. Quando executado, cria jobs para todas as contas vinculadas ao webhook.

## Estrutura do Banco de Dados

### Tabela: `webhook_monitor_alerts`

Armazena alertas ativos sendo monitorados:

```sql
- id (PK)
- webhook_source_id (FK)
- webhook_event_id (FK)
- exchange_account_id (FK, nullable) -- Opcional, apenas para referência
- symbol (VARCHAR(50))
- trade_mode (VARCHAR(20))
- side (VARCHAR(10)) -- 'BUY' | 'S
ELL'
- price_alert (DECIMAL(36, 18)) -- Preço do alerta original
- price_minimum (DECIMAL(36, 18), nullable) -- Menor preço visto (BUY)
- price_maximum (DECIMAL(36, 18), nullable) -- Maior preço visto (SELL)
- current_price (DECIMAL(36, 18), nullable) -- Preço atual
- execution_price (DECIMAL(36, 18), nullable) -- Preço quando foi executado
- state (VARCHAR(50)) -- 'MONITORING' | 'EXECUTED' | 'CANCELLED'
- monitoring_status (VARCHAR(20), nullable) -- 'FALLING' | 'LATERAL' | 'RISING'
- cycles_without_new_low (INT) -- Contador de ciclos sem novo fundo (BUY)
- cycles_without_new_high (INT) -- Contador de ciclos sem novo topo (SELL)
- last_price_check_at (DATETIME, nullable)
- executed_trade_job_id (INT, nullable) -- Primeiro TradeJob ID (compatibilidade)
- executed_trade_job_ids_json (JSON, nullable) -- Array de todos os job IDs criados
- cancel_reason (TEXT, nullable)
- exit_reason (VARCHAR(100), nullable) -- Motivo de saída: 'EXECUTED', 'CANCELLED', 'MAX_FALL', 'MAX_RISE', 'MAX_TIME', 'REPLACED'
- exit_details (TEXT, nullable) -- Detalhes do motivo (ex: "Lateralizado por 5 ciclos")
- created_at, updated_at
```

**Índices**:
- `(webhook_source_id, symbol, trade_mode, state)` - Busca rápida de alertas ativos
- `(state)` - Filtro por estado
- `(side)` - Filtro por tipo (BUY/SELL)
- `(created_at)` - Ordenação temporal

### Tabela: `webhook_monitor_config`

Configurações de monitoramento (global ou por usuário):

```sql
- id (PK)
- user_id (INT, nullable, UNIQUE) -- null = configuração global
- monitor_enabled (BOOLEAN, default: true)
- check_interval_sec (INT, default: 30)
-- Parâmetros para BUY
- lateral_tolerance_pct (DECIMAL(5,2), default: 0.30)
- lateral_cycles_min (INT, default: 4)
- rise_trigger_pct (DECIMAL(5,2), default: 0.75)
- rise_cycles_min (INT, default: 2)
- max_fall_pct (DECIMAL(5,2), default: 6.00)
- max_monitoring_time_min (INT, default: 60)
- cooldown_after_execution_min (INT, default: 30)
-- Parâmetros para SELL
- sell_lateral_tolerance_pct (DECIMAL(5,2), default: 0.30)
- sell_lateral_cycles_min (INT, default: 4)
- sell_fall_trigger_pct (DECIMAL(5,2), default: 0.50)
- sell_fall_cycles_min (INT, default: 2)
- sell_max_rise_pct (DECIMAL(5,2), default: 6.00)
- sell_max_monitoring_time_min (INT, default: 60)
- sell_cooldown_after_execution_min (INT, default: 30)
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
| **Parâmetros BUY** | | |
| `lateral_tolerance_pct` | 0.3% | Margem para considerar preço lateral |
| `lateral_cycles_min` | 4 | Ciclos sem novo fundo para executar em lateral |
| `rise_trigger_pct` | 0.75% | Percentual de alta a partir do mínimo para executar |
| `rise_cycles_min` | 2 | Ciclos mínimos após alta para executar |
| `max_fall_pct` | 6% | Queda máxima desde o alerta para cancelar |
| `max_monitoring_time_min` | 60 | Tempo máximo de monitoramento (minutos) |
| `cooldown_after_execution_min` | 30 | Cooldown após execução (minutos) |
| **Parâmetros SELL** | | |
| `sell_lateral_tolerance_pct` | 0.3% | Margem para considerar preço lateral em vendas |
| `sell_lateral_cycles_min` | 4 | Ciclos sem novo topo para executar venda em lateral |
| `sell_fall_trigger_pct` | 0.5% | Percentual de queda a partir do máximo para executar venda |
| `sell_fall_cycles_min` | 2 | Ciclos mínimos após queda para executar venda |
| `sell_max_rise_pct` | 6% | Alta máxima desde o alerta para cancelar venda |
| `sell_max_monitoring_time_min` | 60 | Tempo máximo de monitoramento para venda (minutos) |
| `sell_cooldown_after_execution_min` | 30 | Cooldown após execução de venda (minutos) |

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
  - Tipo (BUY/SELL com badge colorido)
  - Preço Alerta
  - Preço Mín/Máx (verde para BUY, vermelho para SELL)
  - Preço Atual
  - Estado (badge colorido)
  - Status Monitoramento (Em queda/Lateralizado X ciclos/Em alta X ciclos)
  - Ciclos (sem novo fundo para BUY, sem novo topo para SELL)
  - Criado em
  - Ações (botão para cancelar)

- **Atualização automática**: A cada 3 segundos (realtime)
- **Indicador visual**: Spinner animado e timestamp da última atualização
- **Cards visuais**: Status de cada alerta (caindo/lateral/subindo)

#### Aba "Parâmetros"

Formulário com todos os parâmetros ajustáveis, organizados em duas seções:

- **Seção "Parâmetros para Compra (BUY)"**: Todos os parâmetros relacionados a compras
- **Seção "Parâmetros para Venda (SELL)"**: Todos os parâmetros relacionados a vendas

- Grid responsivo com campos organizados
- Validação de ranges (min/max)
- Descrições explicativas para cada parâmetro
- Botão "Salvar Configurações"

#### Aba "Histórico"

Tabela de alertas já executados ou cancelados:

- **Colunas**:
  - Símbolo
  - Tipo (BUY/SELL)
  - Preço Alerta
  - Preço Mín/Máx (conforme tipo)
  - Preço Atual
  - Preço Execução (quando executado)
  - Estado
  - Motivo Saída (com detalhes: "Lateralizado por X ciclos", "Em alta por Y ciclos", etc)
  - Detalhes (informações adicionais)
  - Webhook (não mostra mais "Conta", pois monitoramento é por webhook)
  - Criado em

- Filtros por símbolo, estado, data
- Detalhes completos de cada execução/cancelamento
- Motivo detalhado do cancelamento (quando aplicável)

## Integração com Sistema Existente

### Aproveitamento do Price Sync

O monitor utiliza o cache de preços do `price-sync` processor:

- Busca preço do cache primeiro (chave: `price:{exchange}:{symbol}`)
- Prioriza Binance (`BINANCE_SPOT`) e tenta outras exchanges se necessário
- Se não estiver no cache, busca diretamente da Binance
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

- Apenas alertas `BUY_SIGNAL` ou `SELL_SIGNAL` são monitorados
- `price_reference` deve estar presente no webhook
- Trade mode deve corresponder entre webhook e conta
- Um alerta por webhook (símbolo + trade_mode + side)
- Monitoramento acontece ANTES de vincular a contas

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
2. Alerta é `BUY_SIGNAL` ou `SELL_SIGNAL`?
3. `price_reference` está presente no webhook?
4. Trade mode corresponde entre webhook e conta?
5. Não há cooldown ativo para o par?

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

As migrations criam:
- `20250220000000_add_webhook_monitor`: Tabelas básicas
- `20251210000000_refactor_webhook_monitor_one_per_webhook`: Refatoração para 1 alerta por webhook
- `20251210000001_add_sell_monitoring_and_execution_details`: Suporte a SELL e detalhes de execução

**Campos adicionados na última migration:**
- `side` (BUY/SELL)
- `price_maximum` (para SELL)
- `execution_price` (preço de execução)
- `cycles_without_new_high` (para SELL)
- `executed_trade_job_ids_json` (todos os jobs criados)
- `exit_details` (detalhes do motivo de saída)
- Parâmetros SELL em `webhook_monitor_config`

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

## Monitoramento de Vendas (SELL)

### Conceito

O monitoramento de vendas funciona de forma **invertida** ao de compras:

- **BUY**: Monitora enquanto cai, executa quando para de cair (lateraliza/sobe)
- **SELL**: Monitora enquanto sobe, executa quando para de subir (lateraliza/cai)

### Fluxo SELL

1. **Alerta chega (SELL_SIGNAL)**
   - Se `monitor_enabled = true` → Criar alerta de monitoramento
   - Armazenar: `price_alert`, `price_maximum = price_alert`, `estado = MONITORING`, `side = SELL`

2. **Novo alerta mais alto**
   - Se novo preço > `price_maximum` → Substituir alerta antigo
   - Atualizar `price_maximum` e resetar contadores

3. **Loop de monitoramento (30s)**
   - Atualizar `price_maximum` se preço atual > máximo
   - Classificar tendência:
     - **RISING**: Ainda subindo (novo máximo ou tendência clara de alta)
     - **LATERAL**: Lateralizando (dentro de faixa pequena do máximo)
     - **FALLING**: Iniciando queda (preço abaixo do máximo por margem)

4. **Execução**
   - **Lateral**: Preço lateral há X ciclos → Executa venda
   - **Queda**: Preço caiu Y% do máximo há Z ciclos → Executa venda
   - Cria TradeJobs SELL para todas as contas vinculadas

5. **Proteções**
   - **Max Rise**: Cancelar se subiu > X% desde o alerta
   - **Max Time**: Cancelar se monitorando > 1 hora
   - **Cooldown**: Não aceitar novos alertas por 30-60min após execução

### Parâmetros SELL

Todos os parâmetros SELL são independentes dos parâmetros BUY, permitindo ajustes finos para cada tipo de operação.

**Última atualização**: 2025-12-10

