# Conceitos de Trading

Este documento explica os conceitos de trading implementados no sistema.

## Modos de Trading

### REAL

No modo **REAL**, as ordens são executadas de verdade na exchange:

- Requer API Key e Secret válidos
- Ordens são enviadas para a exchange via CCXT
- Saldos são reais e sincronizados com a exchange
- Posições refletem trades reais executados

**Uso**: Trading real com capital real.

### SIMULATION

No modo **SIMULATION**, as ordens são simuladas:

- Não requer API Key/Secret (apenas para buscar preços)
- Ordens não são enviadas para a exchange
- Saldos são virtuais (armazenados no banco)
- Posições são criadas com base em simulação

**Uso**: Backtesting "online" via webhooks, testes de estratégias sem risco.

## Cofres Virtuais (Vaults)

Cofres são contêineres de capital que permitem:

- **Controle de Capital**: Limitar quanto pode ser usado em trades
- **Isolamento**: Separar capital por estratégia ou objetivo
- **Gerenciamento de Risco**: Controlar exposição total

### Saldos

Cada cofre pode ter saldos em múltiplos ativos:
- **Balance**: Saldo total
- **Reserved**: Valor reservado para trades pendentes
- **Available**: Valor disponível para novos trades

### Transações

- **DEPOSIT**: Adiciona fundos ao cofre
- **WITHDRAWAL**: Remove fundos do cofre
- **BUY_RESERVE**: Reserva capital para compra
- **SELL_CONFIRM**: Confirma venda e libera capital

## Posições

Uma posição representa uma quantidade de ativo comprada (ou vendida em short).

### Estados

- **OPEN**: Posição aberta (ainda tem quantidade restante)
- **CLOSED**: Posição fechada (toda quantidade foi vendida)

### Campos Importantes

- **qty_total**: Quantidade total comprada
- **qty_remaining**: Quantidade ainda não vendida
- **price_open**: Preço médio de compra
- **price_close**: Preço médio de venda (quando fechada)

### Fills

Fills são execuções parciais de uma posição:
- Cada compra cria um fill de BUY
- Cada venda cria um fill de SELL
- Todas as ordens de venda devem ter uma posição de origem vinculada (`position_id_to_close`)

## Stop Loss e Take Profit

### Stop Loss (SL)

Stop Loss fecha a posição automaticamente quando o preço cai abaixo de um percentual:

- **sl_enabled**: Se SL está habilitado
- **sl_pct**: Percentual de perda (ex: 2.0 = 2%)
- **sl_triggered**: Se SL foi acionado

**Exemplo**: Se comprou BTC a $50,000 com SL de 2%, a posição será fechada se o preço cair para $49,000.

### Take Profit (TP)

Take Profit fecha a posição automaticamente quando o preço sobe acima de um percentual:

- **tp_enabled**: Se TP está habilitado
- **tp_pct**: Percentual de lucro (ex: 5.0 = 5%)
- **tp_triggered**: Se TP foi acionado

**Exemplo**: Se comprou BTC a $50,000 com TP de 5%, a posição será fechada se o preço subir para $52,500.

### Stop Gain (SG)

Stop Gain é uma funcionalidade de saída antecipada dentro do Take Profit que funciona como um **trailing stop de lucro**. Ele permite proteger lucros parciais ao vender automaticamente se o preço cair após atingir um threshold de ativação.

#### Como Funciona

O Stop Gain possui dois parâmetros principais:

- **sg_pct**: Percentual de lucro que ativa o Stop Gain (ex: 2.0 = 2%)
- **sg_drop_pct**: Percentual de queda permitida após ativação (ex: 0.5 = 0.5%)
- **sg_activated**: Flag indicando se o threshold de ativação foi atingido
- **sg_triggered**: Flag indicando se a venda foi executada

#### Fluxo de Operação

```
1. Posição é aberta (ex: BTC @ $50,000)
2. TP configurado em 5% ($52,500)
3. SG configurado em 2% com queda de 0.5%

Cenário 1 - Atingiu TP diretamente:
├─ Preço sobe para $52,500 (5%)
└─ Vende por TAKE_PROFIT

Cenário 2 - Stop Gain ativado e vendido:
├─ Preço sobe para $51,000 (2%) → SG ATIVADO (sg_activated = true)
├─ Preço sobe para $51,500 (3%)
├─ Preço cai para $50,750 (1.5% = 2% - 0.5%) → SG VENDIDO
└─ Vende por STOP_GAIN

Cenário 3 - SG ativado mas atingiu TP antes de cair:
├─ Preço sobe para $51,000 (2%) → SG ATIVADO
├─ Preço continua subindo
├─ Preço atinge $52,500 (5%)
└─ Vende por TAKE_PROFIT
```

#### Validações e Regras

1. **Dependência de TP**: Stop Gain só pode ser habilitado se Take Profit estiver habilitado
2. **Ordem de Valores**: `sg_pct` deve ser < `tp_pct` (ex: SG 2% < TP 5%)
3. **Queda Obrigatória**: `sg_drop_pct` deve ser > 0 e < `sg_pct`
4. **Threshold de Venda**: A venda ocorre quando lucro cai para `sg_pct - sg_drop_pct` ou menos

#### Exemplo Prático

**Configuração**:
- Preço de Entrada: $50,000
- Take Profit: 5% ($52,500)
- Stop Gain: 2% (ativa em $51,000)
- Queda SG: 0.5% (vende em $50,750)

**Timeline**:
1. Compra BTC @ $50,000
2. Preço sobe para $51,200 (2.4% de lucro)
   - ✅ Stop Gain é ATIVADO (`sg_activated = true`)
   - Sistema passa a monitorar quedas
3. Preço cai para $50,700 (1.4% de lucro)
   - ✅ Lucro está em 1.4%, abaixo do threshold de venda (1.5%)
   - Sistema executa venda automática por STOP_GAIN

### Trailing Stop Gain (TSG)

Trailing Stop Gain é uma evolução do Stop Gain fixo que rastreia continuamente o pico máximo de lucro e vende se o lucro cair uma % configurada a partir desse pico.

**IMPORTANTE**: TSG é **INDEPENDENTE** de Take Profit. Não requer TP habilitado para funcionar.

#### Diferenças

**Stop Gain Fixo**:
- Ativa em 2%, vende se cair 0.5% → sempre vende em 1.5% (fixo)

**Trailing Stop Gain**:
- **Independente de TP** - funciona sozinho
- Ativa em 2%, rastreia pico máximo continuamente
- Se atingir 20% e cair 1% → vende em 19% via LIMIT
- Se subir para 25% e cair 1% → vende em 24% via LIMIT
- Sem limite máximo de lucro rastreado

#### Parâmetros

- `tsg_activation_pct`: % inicial para ativar o rastreamento (ex: 2.0)
- `tsg_drop_pct`: % de queda do pico para executar venda (ex: 0.5 ou 1.0)
- `tsg_max_pnl_pct`: Pico máximo de lucro % rastreado (atualizado dinamicamente)
- `tsg_activated`: Flag indicando se o threshold de ativação foi atingido
- `tsg_triggered`: Flag indicando se a venda foi executada

#### Fluxo de Operação

```
1. Posição é aberta (ex: BTC @ $50,000)
2. TSG configurado: ativa em 2%, vende se cair 1%

Cenário 1 - Rastreamento Básico:
├─ Preço sobe para $51,000 (2%) → TSG ATIVADO (tsg_activated = true, tsg_max_pnl_pct = 2%)
├─ Preço sobe para $52,000 (4%) → NOVO PICO (tsg_max_pnl_pct = 4%)
├─ Preço cai para $51,500 (3% = 4% - 1%) → TSG VENDIDO
└─ Vende por TRAILING_STOP_GAIN

Cenário 2 - Rastreamento Longo:
├─ Preço sobe para $51,000 (2%) → TSG ATIVADO, pico = 2%
├─ Preço sobe para $55,000 (10%) → pico = 10%
├─ Preço sobe para $60,000 (20%) → pico = 20%
├─ Preço cai para $59,500 (19% = 20% - 1%) → TSG VENDIDO
└─ Vende por TRAILING_STOP_GAIN

Cenário 3 - TSG + TP Coexistindo:
├─ TSG: ativa em 2%, vende se cair 0.5%
├─ TP: 25%
├─ Preço sobe para $51,000 (2%) → TSG ativa
├─ Preço sobe para $62,500 (25%) → VENDE por TP (atingiu primeiro)
└─ Se TSG disparar antes, vende por TSG
```

#### Validações e Regras

1. **TSG Independente**: TSG NÃO requer TP habilitado - funciona de forma autônoma
2. **Activation > 0**: A % de ativação deve ser > 0 (ex: 2.0)
3. **Drop > 0**: A % de queda deve ser > 0 (ex: 0.5, 1.0, 2.0)
4. **Mutual Exclusion**: TSG e Stop Gain fixo são mutuamente exclusivos (só um pode estar ativo)
5. **Compatível com TP**: TSG e TP podem coexistir - se TP disparar primeiro, executa TP
6. **Sem Min Profit**: TSG NÃO valida min_profit_pct (protege lucros já obtidos)
7. **Ordem LIMIT**: SEMPRE criar ordens LIMIT com spread de 0.1% para garantir execução
8. **Rastreamento Contínuo**: O pico máximo é atualizado sempre que o lucro sobe, sem limite

#### Exemplo Prático

**Configuração**:
- Preço de Entrada: $50,000
- Trailing Stop Gain: Ativa em 2%, vende se cair 1%
- Take Profit: 25% (opcional)

**Timeline**:
1. Compra BTC @ $50,000
2. Preço sobe para $51,000 (2% de lucro)
   - ✅ TSG é ATIVADO (`tsg_activated = true`, `tsg_max_pnl_pct = 2%`)
   - Sistema passa a rastrear o pico máximo
3. Preço sobe para $55,000 (10% de lucro)
   - ✅ NOVO PICO (`tsg_max_pnl_pct = 10%`)
   - Threshold de venda agora: 9% (10% - 1%)
4. Preço sobe para $60,000 (20% de lucro)
   - ✅ NOVO PICO (`tsg_max_pnl_pct = 20%`)
   - Threshold de venda agora: 19% (20% - 1%)
5. Preço cai para $59,500 (19% de lucro)
   - ✅ Lucro está em 19%, igual ao threshold de venda
   - Sistema executa venda automática por TRAILING_STOP_GAIN via LIMIT
4. Resultado: Lucro de 1.4% protegido ao invés de esperar pelo TP de 5%

#### Quando Usar

**Use Stop Gain quando**:
- Quer garantir lucros parciais em mercados voláteis
- Tem um Take Profit alto mas aceita sair mais cedo
- Quer proteção contra reversões rápidas de tendência

**Não use Stop Gain quando**:
- Quer manter a posição até o TP máximo sem interferências
- O mercado está em tendência forte sem correções
- A volatilidade do ativo torna difícil calibrar a queda permitida

#### Diferença entre Stop Gain e Take Profit Parcial

| Característica | Stop Gain | Take Profit Parcial |
|----------------|-----------|---------------------|
| Ativa quando | Atingir threshold de lucro | N/A |
| Vende quando | Cair X% após ativar | Atingir % específico |
| Proteção | Dinâmica (trailing) | Estática |
| Flexibilidade | Permite subir mais | Vende imediatamente |

### Trailing Stop

Trailing Stop ajusta o SL conforme o preço sobe:

- **trailing_enabled**: Se trailing está habilitado
- **trailing_distance_pct**: Distância percentual do preço máximo
- **trailing_max_price**: Preço máximo atingido

**Exemplo**: Com trailing de 2% e preço máximo de $52,000, o SL fica em $50,960. Se o preço cair para $50,960, fecha a posição.

## Webhooks

Webhooks são sinais de trading recebidos de fontes externas (TradingView, bots, etc.).

### Fluxo

1. **Webhook Source**: Configuração do endpoint público
2. **Webhook Recebido**: POST para `/webhooks/:code`
3. **Parsing**: Sistema parseia o sinal (símbolo, ação, etc.)
4. **Bindings**: Para cada conta vinculada, cria um TradeJob
5. **Execução**: Executor processa o job e executa ordem

### Segurança

- **IP Whitelist**: Lista de IPs permitidos
- **Assinatura HMAC**: Validação de integridade
- **Rate Limiting**: Limite de requisições por minuto
- **Idempotência**: Prevenção de duplicação via `event_uid`

## Trade Jobs

Trade Jobs são intenções de trading que são processadas assincronamente.

### Estados

- **PENDING**: Aguardando processamento
- **EXECUTING**: Sendo executado na exchange
- **FILLED**: Completamente executado
- **PARTIALLY_FILLED**: Parcialmente executado
- **FAILED**: Falhou na execução
- **CANCELED**: Cancelado
- **PENDING_LIMIT**: Aguardando preço (ordem LIMIT)

### Tipos de Ordem

- **MARKET**: Execução imediata ao preço de mercado
- **LIMIT**: Aguarda preço específico antes de executar

## Parâmetros de Trading

Parâmetros de trading definem como os trades são executados:

### Quantidade

- **quote_amount_fixed**: Valor fixo em quote asset (ex: $100 em USDT)
- **quote_amount_pct_balance**: Percentual do saldo disponível

### Rate Limiting

- **max_orders_per_hour**: Máximo de ordens por hora
- **min_interval_sec**: Intervalo mínimo entre ordens (segundos)

### Padrões

- **order_type_default**: Tipo de ordem padrão (MARKET ou LIMIT)
- **default_sl_enabled**: Se SL padrão está habilitado
- **default_sl_pct**: Percentual de SL padrão
- **default_tp_enabled**: Se TP padrão está habilitado
- **default_tp_pct**: Percentual de TP padrão

## Cálculo de PnL

### PnL Realizado

PnL de posições fechadas:

```
PnL = (price_close - price_open) * qty_total
PnL% = ((price_close - price_open) / price_open) * 100
```

### PnL Não Realizado

PnL de posições abertas:

```
Unrealized PnL = (current_price - price_open) * qty_remaining
Unrealized PnL% = ((current_price - price_open) / price_open) * 100
```

### Vinculação de Posições

Todas as ordens de venda (SELL) devem ter uma posição de origem vinculada através do campo `position_id_to_close`:
- Cada ordem de venda fecha uma posição específica
- O PnL é calculado baseado no preço de abertura da posição vinculada
- Não é permitido criar ordens SELL sem `position_id_to_close`

## Ordens LIMIT

Ordens LIMIT aguardam um preço específico antes de executar:

### Compra LIMIT

- Ordem é criada com `limit_price`
- Aguarda preço atingir ou ficar abaixo do limite
- Quando atinge, executa como ordem MARKET

### Venda LIMIT

- Ordem é criada com `limit_price`
- Aguarda preço atingir ou ficar acima do limite
- Quando atinge, executa como ordem MARKET

### Expiração

- Ordens LIMIT podem ter `limit_order_expires_at`
- Após expirar, ordem é cancelada automaticamente

## Monitoramento

### SL/TP Monitor

Executa a cada 30 segundos:
1. Busca posições abertas com SL/TP
2. Obtém preço atual da exchange
3. Calcula PnL percentual
4. Verifica se SL/TP foi atingido
5. Se sim, cria TradeJob de venda

### Limit Orders Monitor

Executa a cada 60 segundos:
1. Busca ordens LIMIT pendentes
2. Verifica se preço foi atingido
3. Se sim, executa ordem
4. Verifica expiração e cancela se necessário

### Balances Sync

Executa a cada 5 minutos:
1. Para cada conta ativa, busca saldos na exchange
2. Atualiza cache local de saldos
3. Usado para exibir saldos atualizados

## Notificações

O sistema envia notificações WhatsApp para:
- **Posição Aberta**: Quando uma posição é aberta
- **Posição Fechada**: Quando uma posição é fechada
- **Stop Loss Acionado**: Quando SL fecha uma posição
- **Take Profit Acionado**: Quando TP fecha uma posição
- **Erro de Trading**: Quando um trade falha
- **Webhook Recebido**: Quando um webhook é processado (opcional)

---

**Última atualização**: 2025-02-20

