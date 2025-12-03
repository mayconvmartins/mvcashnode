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
- Posições usam FIFO (First In, First Out) para calcular PnL

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

### FIFO (First In, First Out)

O sistema usa FIFO para calcular PnL:
- Primeiras compras são as primeiras vendas
- PnL é calculado baseado no preço médio de compra

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

**Última atualização**: 2025-02-12

