# Validações de Segurança Financeira

Este documento descreve todas as validações de segurança implementadas no sistema para prevenir erros financeiros críticos, como vendas duplicadas, over-selling e ordens sem posição vinculada.

## Problemas Prevenidos

1. **Double-Sell**: Vender a mesma posição múltiplas vezes na exchange
2. **Over-Selling**: Tentar vender mais do que a posição possui
3. **Ordens Órfãs**: Criar ordens de venda sem posição vinculada
4. **Race Conditions**: Múltiplos processos tentando vender a mesma posição simultaneamente
5. **Quantidades Inválidas**: Tentar vender quantidades zero, negativas ou muito pequenas

## Camadas de Validação

O sistema implementa múltiplas camadas de validação em diferentes pontos do fluxo:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. TradeJobService.createJob()                              │
│    - Validação de ordem duplicada                           │
│    - Validação de position_id_to_close obrigatório          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SL/TP Monitor (Antes de criar job)                      │
│    - Verificação de job existente                           │
│    - Revalidação de posição                                 │
│    - Lock otimista                                          │
│    - Double-check após lock                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. TradeExecutionProcessor (Antes de executar)             │
│    - Validação de posição                                   │
│    - Validação de quantidade vs posição                     │
│    - Prevenção de over-selling                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. PositionService.onSellExecuted()                         │
│    - FOR UPDATE lock                                        │
│    - Revalidação após lock                                  │
│    - Validação de quantidade                                │
└─────────────────────────────────────────────────────────────┘
```

## 1. Validações no TradeJobService

**Arquivo:** `packages/domain/src/trading/trade-job.service.ts`

### Validação de Ordem Duplicada

**Quando:** Ao criar um novo job de venda

**O que verifica:**
- Se já existe um job SELL para a mesma posição em status ativo:
  - `PENDING`
  - `PENDING_LIMIT`
  - `EXECUTING`
  - `PARTIALLY_FILLED` ← **CRÍTICO**: Inclui ordens parcialmente preenchidas

**Código:**
```typescript
if (dto.side === 'SELL' && dto.positionIdToClose) {
  const existingOrder = await this.prisma.tradeJob.findFirst({
    where: {
      position_id_to_close: dto.positionIdToClose,
      side: 'SELL',
      status: {
        in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED']
      },
    },
  });

  if (existingOrder) {
    throw new Error(
      `[DUPLICATE-ORDER-BLOCKED] Já existe uma ordem para a posição ${dto.positionIdToClose}`
    );
  }
}
```

**Erro retornado:**
```
[DUPLICATE-ORDER-BLOCKED] Já existe uma ordem LIMIT para a posição 123 (criado por: STOP_GAIN). 
Job ID: 456, Status: PARTIALLY_FILLED (qty: 0.5). 
Não é permitido criar múltiplas ordens para a mesma posição.
```

### Validação de position_id_to_close Obrigatório

**Quando:** Ao criar qualquer job de venda

**O que verifica:**
- Todas as ordens SELL devem ter `position_id_to_close`

**Código:**
```typescript
if (dto.side === 'SELL' && !dto.positionIdToClose) {
  throw new Error(
    `[MISSING-POSITION-ID] Todas ordens de VENDA devem ter position_id_to_close.`
  );
}
```

## 2. Validações no SL/TP Monitor

**Arquivos:**
- `apps/monitors/src/sltp-monitor/processors/sltp-monitor-real.processor.ts`
- `apps/monitors/src/sltp-monitor/processors/sltp-monitor-sim.processor.ts`

### Etapa 1: Verificação de Job Existente (ANTES do Lock)

**Quando:** Antes de tentar criar um novo job de venda

**O que verifica:**
- Se já existe um job SELL ativo para a posição

**Por quê:** Evita criar jobs desnecessários antes mesmo de tentar o lock

**Código:**
```typescript
const existingJob = await this.prisma.tradeJob.findFirst({
  where: {
    position_id_to_close: position.id,
    side: 'SELL',
    status: { 
      in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] 
    }
  },
});

if (existingJob) {
  // Pula criação de novo job
  continue;
}
```

### Etapa 2: Revalidação de Posição (ANTES do Lock)

**Quando:** Antes de tentar o lock otimista

**O que verifica:**
- Se a posição ainda está `OPEN`
- Se `qty_remaining > 0`
- Se o valor estimado é >= $1 USD (evita tentar vender resíduos)

**Código:**
```typescript
const freshPosition = await this.prisma.tradePosition.findUnique({
  where: { id: position.id },
  select: { qty_remaining: true, status: true, symbol: true }
});

if (!freshPosition || 
    freshPosition.status !== 'OPEN' || 
    freshPosition.qty_remaining.toNumber() <= 0) {
  continue; // Pula
}

const minQtyUSD = 1;
const estimatedValueUSD = freshPosition.qty_remaining.toNumber() * currentPrice;
if (estimatedValueUSD < minQtyUSD) {
  continue; // Resíduo muito pequeno
}
```

### Etapa 3: Lock Otimista

**Quando:** Após validações iniciais

**O que faz:**
- Tenta atualizar a flag de trigger (`tp_triggered`, `sl_triggered`, etc.) atomicamente
- Só atualiza se a flag ainda estiver `false` e a posição estiver `OPEN`

**Código:**
```typescript
const lockResult = await this.prisma.tradePosition.updateMany({
  where: { 
    id: position.id, 
    tp_triggered: false,  // ← Condição crítica
    status: 'OPEN',
    qty_remaining: { gt: 0 }
  },
  data: { tp_triggered: true },
});

if (lockResult.count === 0) {
  // Lock falhou - outra execução já processou
  continue;
}
```

**Por quê:** Garante que apenas uma execução do monitor pode processar a posição

### Etapa 4: Double-Check Após Lock

**Quando:** Imediatamente após adquirir o lock

**O que verifica:**
- Se não foi criado um job por outra execução durante o lock

**Código:**
```typescript
const doubleCheckJob = await this.prisma.tradeJob.findFirst({
  where: {
    position_id_to_close: position.id,
    side: 'SELL',
    status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] }
  },
});

if (doubleCheckJob) {
  // Reverter flag e pular
  await this.prisma.tradePosition.update({
    where: { id: position.id },
    data: { tp_triggered: false }
  });
  continue;
}
```

**Por quê:** Previne race condition onde dois monitores adquirem lock simultaneamente

## 3. Validações no Executor (Pré-Execução)

**Arquivo:** `apps/executor/src/trade-execution/processors/trade-execution-real.processor.ts`

### Validação de Posição para SELL

**Quando:** Antes de processar qualquer ordem de venda

**O que verifica:**
- Se a posição existe
- Se a posição está `OPEN`
- Se `qty_remaining > 0`

**Código:**
```typescript
if (tradeJob.side === 'SELL' && tradeJob.position_id_to_close) {
  const targetPosition = await this.prisma.tradePosition.findUnique({
    where: { id: tradeJob.position_id_to_close },
  });

  if (!targetPosition) {
    // Marca job como SKIPPED
    return { success: false, skipped: true, reason: 'POSITION_NOT_FOUND' };
  }

  if (targetPosition.status !== 'OPEN') {
    return { success: false, skipped: true, reason: 'POSITION_NOT_OPEN' };
  }

  if (targetPosition.qty_remaining.toNumber() <= 0) {
    return { success: false, skipped: true, reason: 'POSITION_NO_QUANTITY' };
  }
}
```

### Validação de Over-Selling

**Quando:** Antes de criar a ordem na exchange

**O que verifica:**
- Se `jobBaseQty` não excede `positionQtyRemaining` em mais de 1%

**Código:**
```typescript
const jobBaseQty = tradeJob.base_quantity?.toNumber() || 0;
const positionQtyRemaining = targetPosition.qty_remaining.toNumber();

// Margem de 1% para arredondamentos normais
if (jobBaseQty > positionQtyRemaining * 1.01) {
  // ABORTA - pode indicar job duplicado ou race condition
  await this.prisma.tradeJob.update({
    where: { id: tradeJobId },
    data: {
      status: TradeJobStatus.SKIPPED,
      reason_code: 'QUANTITY_EXCEEDS_POSITION',
    },
  });
  return { success: false, skipped: true, reason: 'QUANTITY_EXCEEDS_POSITION' };
}

// Se excede em até 1%, ajusta silenciosamente (arredondamentos)
if (jobBaseQty > positionQtyRemaining) {
  // Ajusta quantidade do job
  baseQty = positionQtyRemaining;
}
```

**Por quê:** Previne tentar vender mais do que a posição possui, o que causaria erro na exchange ou venda incorreta

### Validação de Quantidade Mínima

**Quando:** Antes de criar ordem na exchange

**O que verifica:**
- Se a quantidade é > 0
- Se não é NaN

**Código:**
```typescript
if (amountToUse <= 0 || isNaN(amountToUse)) {
  throw new Error(`Invalid quantity: ${amountToUse}`);
}
```

## 4. Validações no PositionService.onSellExecuted()

**Arquivo:** `packages/domain/src/positions/position.service.ts`

### Validação Crítica de position_id_to_close

**Quando:** No início de `onSellExecuted()`

**O que verifica:**
- Se o job tem `position_id_to_close` (obrigatório)

**Código:**
```typescript
if (!job.position_id_to_close) {
  const errorMsg = '[CRITICAL] SELL job must have position_id_to_close.';
  await tx.tradeJob.update({
    where: { id: jobId },
    data: { status: TradeJobStatus.FAILED, reason_message: errorMsg }
  });
  throw new Error(errorMsg);
}
```

### FOR UPDATE Lock

**Quando:** Antes de atualizar a posição

**O que faz:**
- Adquire lock pessimista na posição
- Previne outras transações de modificar a posição simultaneamente

**Código:**
```typescript
await tx.$executeRaw`
  SELECT id FROM trade_positions 
  WHERE id = ${job.position_id_to_close} 
  FOR UPDATE
`;

// Agora carrega posição com lock
const lockedPosition = await tx.tradePosition.findUnique({
  where: { id: job.position_id_to_close },
  // ... campos necessários
});
```

**Por quê:** Garante que apenas uma transação pode processar a venda da posição por vez

### Revalidação Após Lock

**Quando:** Imediatamente após adquirir o lock

**O que verifica:**
- Se a posição ainda está `OPEN`
- Se `qty_remaining > 0`

**Código:**
```typescript
if (!lockedPosition || 
    lockedPosition.status !== 'OPEN' || 
    lockedPosition.qty_remaining.toNumber() <= 0) {
  // Marca job como SKIPPED
  await tx.tradeJob.update({
    where: { id: jobId },
    data: { status: TradeJobStatus.SKIPPED }
  });
  return; // Aborta
}
```

**Por quê:** A posição pode ter sido fechada por outra transação durante o lock

### Validação de Quantidade vs Posição

**Quando:** Ao calcular quantidade a fechar

**O que faz:**
- Garante que não tenta fechar mais do que a posição possui

**Código:**
```typescript
const actualQtyRemaining = lockedPosition.qty_remaining.toNumber();
const qtyToClose = Math.min(executedQty, actualQtyRemaining);
```

**Por quê:** Previne over-selling mesmo após lock

## Resumo das Proteções

| Camada | Proteção | Método |
|--------|----------|--------|
| **TradeJobService** | Ordem duplicada | Query antes de criar |
| **TradeJobService** | position_id obrigatório | Validação de campo |
| **SL/TP Monitor** | Job existente | Query antes de lock |
| **SL/TP Monitor** | Revalidação de posição | Query antes de lock |
| **SL/TP Monitor** | Lock otimista | updateMany com condições |
| **SL/TP Monitor** | Double-check | Query após lock |
| **Executor** | Validação de posição | Query antes de executar |
| **Executor** | Over-selling | Comparação de quantidades |
| **PositionService** | position_id obrigatório | Validação crítica |
| **PositionService** | FOR UPDATE lock | Lock pessimista |
| **PositionService** | Revalidação após lock | Query após lock |
| **PositionService** | Quantidade vs posição | Math.min() |

## Logs de Segurança

Todos os pontos críticos geram logs com prefixo `[SEGURANÇA]`:

```
[SEGURANÇA] ✅ Job 123 - Posição 456 validada
[SEGURANÇA] [OVER-SELLING-BLOCKED] Job 123 - Quantidade excede posição
[SEGURANÇA] [DUPLICATE-PREVENTION] Job 456 já existe para posição 123
[SEGURANÇA] [LOCK-FAILED] Lock falhou para posição 123
```

## Resultado

Com todas essas validações em camadas, o sistema garante que:

1. ✅ **Nunca** cria múltiplas ordens para a mesma posição
2. ✅ **Nunca** tenta vender mais do que a posição possui
3. ✅ **Nunca** cria ordens de venda sem posição vinculada
4. ✅ **Nunca** processa vendas simultâneas da mesma posição
5. ✅ **Sempre** valida quantidades antes de executar

---

**Última atualização**: 2025-12-18

