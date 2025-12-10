# Relatório de Auditoria de Bugs - MVCashNode

**Data:** 2025-01-XX  
**Escopo:** Auditoria completa do sistema de trading automatizado  
**Status:** Completo

---

## Resumo Executivo

Esta auditoria identificou **23 bugs** classificados por severidade:
- 🔴 **CRÍTICO:** 4 bugs
- 🟠 **ALTO:** 8 bugs  
- 🟡 **MÉDIO:** 7 bugs
- 🟢 **BAIXO:** 4 bugs

---

## 🔴 BUGS CRÍTICOS

### BUG-CRIT-001: Vault - Falta validação de reserved_balance no withdraw
**Arquivo:** `packages/domain/src/vaults/vault.service.ts:105-143`

**Problema:** O método `withdraw()` verifica apenas `balance`, mas não considera `reserved_balance`. Isso permite retirar fundos que estão reservados para compras pendentes.

**Código problemático:**
```typescript
if (!balance || balance.balance.toNumber() < dto.amount) {
  throw new Error('Insufficient balance');
}
```

**Impacto:** Saldo disponível pode ficar negativo se houver reservas ativas.

**Correção sugerida:**
```typescript
const availableBalance = balance.balance.toNumber() - (balance.reserved?.toNumber() || 0);
if (!balance || availableBalance < dto.amount) {
  throw new Error('Insufficient available balance (considering reservations)');
}
```

---

### BUG-CRIT-002: Vault - Race condition em reserveForBuy sem SELECT FOR UPDATE
**Arquivo:** `packages/domain/src/vaults/vault.service.ts:145-188`

**Problema:** O comentário diz "SELECT FOR UPDATE to lock the row", mas o código usa `findUnique()` que não faz lock. Múltiplas reservas simultâneas podem resultar em saldo negativo.

**Código problemático:**
```typescript
const balance = await tx.vaultBalance.findUnique({
  where: { vault_id_asset: { vault_id: vaultId, asset } },
});
```

**Impacto:** Saldo pode ficar negativo em cenários de alta concorrência.

**Correção sugerida:** Usar `findFirst()` com `FOR UPDATE` ou implementar lock pessimista.

---

### BUG-CRIT-003: Position Service - qty_remaining pode ficar negativo
**Arquivo:** `packages/domain/src/positions/position.service.ts:1118-1121`

**Problema:** Validação de `qtyToClose > qty_remaining` existe, mas não há validação após cálculos intermediários que podem resultar em valores negativos.

**Código problemático:**
```typescript
const qtyToClose = quantity || position.qty_remaining.toNumber();
if (qtyToClose > position.qty_remaining.toNumber()) {
  throw new Error('Quantity exceeds remaining');
}
// Mas não valida se qty_remaining ficará negativo após operação
```

**Impacto:** Posições podem ter `qty_remaining` negativo, causando inconsistências financeiras.

**Correção sugerida:** Adicionar validação após atualização:
```typescript
const newQtyRemaining = position.qty_remaining.toNumber() - qtyToClose;
if (newQtyRemaining < 0) {
  throw new Error('Operation would result in negative remaining quantity');
}
```

---

### BUG-CRIT-004: Webhook - Payload sem limite de tamanho
**Arquivo:** `apps/api/src/webhooks/webhooks.controller.ts:44-112`

**Problema:** Não há validação de tamanho máximo do payload. Payloads muito grandes podem causar DoS ou consumo excessivo de memória.

**Impacto:** Ataque de DoS via payload gigante, possível crash do servidor.

**Correção sugerida:** Adicionar middleware para limitar tamanho:
```typescript
// No main.ts ou webhook controller
app.use('/webhooks', express.json({ limit: '10mb' }));
```

---

## 🟠 BUGS DE ALTA SEVERIDADE

### BUG-ALTO-001: Cache Service - Sem limite de tamanho de chaves
**Arquivo:** `packages/shared/src/cache/cache.service.ts`

**Problema:** O cache Redis não tem limite de tamanho ou política de eviction. Pode crescer indefinidamente.

**Impacto:** Memory leak no Redis, possível crash do servidor Redis.

**Correção sugerida:** Configurar Redis com `maxmemory` e política `allkeys-lru`.

---

### BUG-ALTO-002: Position Service - Queries N+1 em findMany
**Arquivo:** `packages/domain/src/positions/position.service.ts:52-71`

**Problema:** Múltiplas queries `findMany` em loop para buscar parâmetros, causando N+1 queries.

**Código problemático:**
```typescript
const allBothParameters = await this.prisma.tradeParameter.findMany({...});
const allBuyParameters = await this.prisma.tradeParameter.findMany({...});
const allSellParameters = await this.prisma.tradeParameter.findMany({...});
```

**Impacto:** Performance degradada, especialmente com muitos parâmetros.

**Correção sugerida:** Consolidar em uma única query:
```typescript
const allParameters = await this.prisma.tradeParameter.findMany({
  where: {
    exchange_account_id: job.exchange_account_id,
    side: { in: ['BOTH', 'BUY', 'SELL'] },
  },
});
```

---

### BUG-ALTO-003: Trade Executor - Erro de rede sem retry adequado
**Arquivo:** `apps/executor/src/trade-execution/processors/trade-execution-real.processor.ts:638-647`

**Problema:** Erros de rede são detectados mas não há retry automático. Apenas marca como FAILED.

**Impacto:** Ordens legítimas podem falhar por problemas temporários de rede.

**Correção sugerida:** Implementar retry com backoff exponencial para erros de rede.

---

### BUG-ALTO-004: Webhook Monitor - Race condition em createOrUpdateAlert
**Arquivo:** `packages/domain/src/webhooks/webhook-monitor.service.ts:144-252`

**Problema:** Embora use `Serializable` isolation level, não há validação de cooldown dentro da transação antes de criar alerta.

**Impacto:** Múltiplos alertas podem ser criados simultaneamente para o mesmo símbolo.

**Correção sugerida:** Mover validação de cooldown para dentro da transação antes de criar.

---

### BUG-ALTO-005: Vault - confirmBuy não valida se reserva existe
**Arquivo:** `packages/domain/src/vaults/vault.service.ts:190-216`

**Problema:** `confirmBuy()` decrementa `reserved` sem verificar se a reserva existe ou se o valor é suficiente.

**Impacto:** `reserved_balance` pode ficar negativo.

**Correção sugerida:**
```typescript
const balance = await tx.vaultBalance.findUnique({...});
if (!balance || balance.reserved.toNumber() < amount) {
  throw new Error('Reservation not found or insufficient');
}
```

---

### BUG-ALTO-006: Position Service - Divisão por zero em cálculos de taxa
**Arquivo:** `packages/domain/src/positions/position.service.ts:849-850`

**Problema:** Cálculo de `feeRate` não valida se `cummQuoteQty > 0` antes de dividir.

**Código problemático:**
```typescript
if (feeAmount > 0 && cummQuoteQty > 0) {
  feeRate = (feeAmount / cummQuoteQty) * 100;
}
```

**Impacto:** Embora tenha validação, se `cummQuoteQty` for 0 em outro lugar, pode causar `Infinity`.

**Correção sugerida:** Validação já existe, mas garantir em todos os lugares.

---

### BUG-ALTO-007: Admin Controller - ParseInt sem validação de entrada
**Arquivo:** `apps/api/src/admin/admin-system.controller.ts:238-239`

**Problema:** `parseInt(page)` e `parseInt(limit)` sem validação podem resultar em `NaN` ou valores inválidos.

**Impacto:** Queries podem falhar silenciosamente ou retornar resultados incorretos.

**Correção sugerida:**
```typescript
const pageNum = page ? Math.max(1, parseInt(page) || 1) : 1;
const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit) || 50)) : 50;
```

---

### BUG-ALTO-008: Webhook Parser - Payload muito grande pode causar crash
**Arquivo:** `packages/domain/src/webhooks/webhook-parser.service.ts:14-187`

**Problema:** Processa payload completo em memória sem limite. Payloads muito grandes podem causar OOM.

**Impacto:** Crash do processo Node.js.

**Correção sugerida:** Validar tamanho antes de processar ou usar streaming.

---

## 🟡 BUGS DE MÉDIA SEVERIDADE

### BUG-MED-001: Cache Service - Sem cleanup de listeners
**Arquivo:** `packages/shared/src/cache/cache.service.ts:31-44`

**Problema:** Event listeners do Redis não são removidos ao desconectar, podendo causar memory leaks.

**Correção sugerida:** Remover listeners em `disconnect()`:
```typescript
this.client.removeAllListeners();
```

---

### BUG-MED-002: Executor - setInterval sem cleanup
**Arquivo:** `apps/executor/src/main.ts:92`

**Problema:** `setInterval` para métricas não é limpo ao encerrar o processo.

**Correção sugerida:** Armazenar interval ID e limpar no shutdown.

---

### BUG-MED-003: Position Service - Uso excessivo de `as any`
**Arquivo:** `packages/domain/src/webhooks/webhook-monitor.service.ts:97-103`

**Problema:** Múltiplos usos de `(userConfig as any)` sem tipagem adequada.

**Impacto:** Perda de type safety, possíveis erros em runtime.

**Correção sugerida:** Criar interface adequada para `userConfig`.

---

### BUG-MED-004: Admin Controller - Logs excessivos em produção
**Arquivo:** `apps/api/src/webhooks/webhooks.controller.ts:66-113`

**Problema:** Muitos `console.log` com dados completos de payload em produção.

**Impacto:** Performance degradada, logs difíceis de analisar.

**Correção sugerida:** Usar logger estruturado com níveis (debug/info/error).

---

### BUG-MED-005: Vault - Transações sem tratamento de deadlock
**Arquivo:** `packages/domain/src/vaults/vault.service.ts`

**Problema:** Transações não tratam especificamente erros de deadlock (P2034).

**Impacto:** Operações podem falhar sem retry em caso de deadlock.

**Correção sugerida:** Implementar retry para deadlocks:
```typescript
catch (error: any) {
  if (error.code === 'P2034') {
    // Retry transaction
  }
}
```

---

### BUG-MED-006: Trade Parameter - Múltiplos parâmetros para mesmo símbolo
**Arquivo:** `packages/domain/src/trading/trade-parameter.service.ts`

**Problema:** Não há validação para evitar múltiplos parâmetros ativos para o mesmo símbolo/lado.

**Impacto:** Comportamento indeterminado ao calcular quote amount.

**Correção sugerida:** Adicionar unique constraint ou validação antes de criar.

---

### BUG-MED-007: Position Service - Validação de qty_remaining <= 0 inconsistente
**Arquivo:** `packages/domain/src/positions/position.service.ts:925,958,1317`

**Problema:** Alguns lugares verificam `<= 0`, outros apenas `< 0`. Inconsistência pode permitir posições com qty_remaining = 0.

**Correção sugerida:** Padronizar para sempre usar `<= 0` ou criar constante.

---

## 🟢 BUGS DE BAIXA SEVERIDADE

### BUG-BAIXO-001: Webhook - Logs com informações de debug
**Arquivo:** `apps/api/src/webhooks/webhooks.controller.ts`

**Problema:** Logs detalhados de debug em produção.

**Correção sugerida:** Usar logger com nível configurável.

---

### BUG-BAIXO-002: Cache Service - TTL hardcoded para preços
**Arquivo:** `packages/shared/src/cache/cache.service.ts:125`

**Problema:** TTL máximo de 25s para preços está hardcoded.

**Correção sugerida:** Tornar configurável via env var.

---

### BUG-BAIXO-003: TypeScript - Uso de `any` em transações
**Arquivo:** `packages/domain/src/vaults/vault.service.ts:59,106,146,191,219,250`

**Problema:** `tx: any` em todas as transações.

**Correção sugerida:** Usar tipo adequado do Prisma.

---

### BUG-BAIXO-004: Admin Controller - Falta paginação em algumas queries
**Arquivo:** `apps/api/src/admin/admin-system.controller.ts`

**Problema:** Algumas queries `findMany` não têm `take`/`skip`.

**Correção sugerida:** Adicionar paginação padrão.

---

## Recomendações Gerais

### 1. Implementar Testes de Integração
- Testes para cenários de race condition
- Testes para edge cases (saldo zero, quantidade mínima, etc.)
- Testes de carga para identificar memory leaks

### 2. Melhorar Monitoramento
- Alertas para saldos negativos
- Alertas para qty_remaining negativo
- Métricas de performance de queries

### 3. Code Review Checklist
- ✅ Validação de entrada
- ✅ Tratamento de erros
- ✅ Transações atômicas
- ✅ Validação de saldos/quantidades
- ✅ Limpeza de recursos (listeners, timers)

### 4. Documentação
- Documentar limites de tamanho de payload
- Documentar políticas de retry
- Documentar tratamento de deadlocks

---

## Priorização de Correções

**Sprint 1 (Crítico - Urgente):**
1. BUG-CRIT-001: Vault reserved_balance
2. BUG-CRIT-002: Vault race condition
3. BUG-CRIT-003: Position qty_remaining negativo
4. BUG-CRIT-004: Webhook payload limit

**Sprint 2 (Alto - Importante):**
5. BUG-ALTO-001: Cache sem limite
6. BUG-ALTO-002: Queries N+1
7. BUG-ALTO-003: Retry em erros de rede
8. BUG-ALTO-004: Race condition webhook monitor

**Sprint 3 (Médio - Melhorias):**
9. BUG-MED-001 a BUG-MED-007

**Sprint 4 (Baixo - Técnico):**
10. BUG-BAIXO-001 a BUG-BAIXO-004

---

**Fim do Relatório**

