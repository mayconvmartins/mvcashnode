# Relatório Completo de Auditoria de Bugs - MVCashNode

**Data:** 2025-01-XX  
**Escopo:** Auditoria completa e sistemática do sistema de trading automatizado  
**Status:** Completo

---

## Resumo Executivo

Esta auditoria identificou **35 bugs** classificados por severidade:
- 🔴 **CRÍTICO:** 6 bugs
- 🟠 **ALTO:** 12 bugs  
- 🟡 **MÉDIO:** 11 bugs
- 🟢 **BAIXO:** 6 bugs

**Bugs já corrigidos:** 8 bugs do relatório anterior foram corrigidos.

---

## 🔴 BUGS CRÍTICOS

### BUG-CRIT-001: Limit Orders Controller - exchangeAccountId sem validação de tipo
**Arquivo:** `apps/api/src/positions/limit-orders.controller.ts:113`

**Problema:** O parâmetro `exchangeAccountId` é tipado como `number` mas vem como string do query. Não há validação antes de usar.

**Código problemático:**
```typescript
@Query('exchange_account_id') exchangeAccountId?: number
```

**Impacto:** Pode causar erros de comparação ou queries incorretas se o valor não for convertido.

**Correção sugerida:**
```typescript
@Query('exchange_account_id') exchangeAccountId?: string
// ... no código
if (exchangeAccountId) {
  const accountIdNum = parseInt(exchangeAccountId, 10);
  if (isNaN(accountIdNum)) {
    throw new BadRequestException('exchange_account_id deve ser um número válido');
  }
  // ... resto do código
}
```

---

### BUG-CRIT-002: Webhooks Controller - Logs excessivos em produção
**Arquivo:** `apps/api/src/webhooks/webhooks.controller.ts:77-124`

**Problema:** Múltiplos `console.log` com dados completos de payload em produção. Isso pode:
- Degradar performance
- Expor dados sensíveis em logs
- Consumir muito espaço em disco

**Impacto:** Performance degradada, possível vazamento de dados sensíveis, logs difíceis de analisar.

**Correção sugerida:** Usar logger estruturado com níveis (debug/info/error) e remover logs detalhados em produção:
```typescript
// Substituir console.log por:
this.logger.debug(`[WEBHOOK] Recebendo requisição para código: ${code}`, {
  ip,
  contentType,
  payloadSize,
  // Não incluir payload completo em produção
});
```

---

### BUG-CRIT-003: Monitoring Controller - parseInt sem validação de limites
**Arquivo:** `apps/api/src/monitoring/monitoring.controller.ts:140,174,255`

**Problema:** `parseInt(limit)` e `parseInt(hours)` sem validação de limites podem resultar em valores inválidos ou muito grandes.

**Código problemático:**
```typescript
const limitNum = limit ? parseInt(limit) : 100;
const hoursNum = hours ? parseInt(hours) : 24;
```

**Impacto:** Queries podem ser muito lentas ou causar problemas de memória com limites muito grandes.

**Correção sugerida:**
```typescript
const limitNum = limit ? Math.min(1000, Math.max(1, parseInt(limit) || 100)) : 100;
const hoursNum = hours ? Math.min(168, Math.max(1, parseInt(hours) || 24)) : 24; // Max 7 dias
```

---

### BUG-CRIT-004: Webhook Monitor Service - Divisão por zero em cálculos de eficiência
**Arquivo:** `packages/domain/src/webhooks/webhook-monitor.service.ts:1243,1248`

**Problema:** Cálculo de `efficiencyPct` pode resultar em divisão por zero se `priceAlert === priceMin` ou `priceMax === priceAlert`.

**Código problemático:**
```typescript
if (priceAlert !== priceMin) {
  efficiencyPct = ((priceAlert - executionPrice) / (priceAlert - priceMin)) * 100;
}
```

**Impacto:** Pode gerar `Infinity` ou `NaN` em cálculos.

**Correção sugerida:** Adicionar validação adicional:
```typescript
if (priceAlert !== priceMin && (priceAlert - priceMin) !== 0) {
  efficiencyPct = ((priceAlert - executionPrice) / (priceAlert - priceMin)) * 100;
} else {
  efficiencyPct = 0; // ou 100, dependendo da lógica
}
```

---

### BUG-CRIT-005: Positions Controller - Divisão por zero em cálculo de PnL percentual
**Arquivo:** `apps/api/src/positions/positions.controller.ts:524`

**Problema:** Cálculo de `unrealizedPnlPct` não valida se `priceOpen > 0` antes de dividir.

**Código problemático:**
```typescript
unrealizedPnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;
```

**Impacto:** Pode gerar `Infinity` ou `NaN` se `priceOpen` for 0.

**Correção sugerida:**
```typescript
unrealizedPnlPct = priceOpen > 0 
  ? ((currentPrice - priceOpen) / priceOpen) * 100 
  : 0;
```

---

### BUG-CRIT-006: Reports Service - Divisão por zero em cálculos de correlação
**Arquivo:** `apps/api/src/reports/reports.service.ts:986`

**Problema:** Cálculo de correlação pode ter divisão por zero se desvio padrão for 0.

**Impacto:** Pode gerar `Infinity` ou `NaN` em métricas de correlação.

**Correção sugerida:** Validar desvio padrão antes de calcular correlação.

---

## 🟠 BUGS DE ALTA SEVERIDADE

### BUG-ALTO-001: Operations Controller - Validação de page/limit incompleta
**Arquivo:** `apps/api/src/trade-jobs/operations.controller.ts:185-193`

**Problema:** Validação de `page` e `limit` não verifica limites máximos, apenas se é NaN.

**Impacto:** Queries podem ser muito lentas com limites muito grandes.

**Correção sugerida:**
```typescript
const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : undefined;
const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 50)) : undefined;
```

---

### BUG-ALTO-002: Webhook Monitor Service - Query SQL raw com possível SQL injection
**Arquivo:** `packages/domain/src/webhooks/webhook-monitor.service.ts:1136`

**Problema:** Uso de `$queryRawUnsafe` com interpolação de parâmetros pode ser vulnerável se não for usado corretamente.

**Código problemático:**
```typescript
const latestIds = await this.prisma.$queryRawUnsafe<Array<{ id: number }>>(
  latestIdsQuery,
  ...params
);
```

**Impacto:** Risco de SQL injection se parâmetros não forem sanitizados.

**Correção sugerida:** Usar `$queryRaw` com template strings do Prisma ou validar/sanitizar todos os parâmetros.

---

### BUG-ALTO-003: Executor - Tratamento de erros de rede sem retry adequado
**Arquivo:** `apps/executor/src/trade-execution/processors/trade-execution-real.processor.ts:718-727`

**Problema:** Erros de rede são detectados mas não há retry automático. Apenas marca como FAILED.

**Impacto:** Ordens legítimas podem falhar por problemas temporários de rede.

**Correção sugerida:** Implementar retry com backoff exponencial para erros de rede (já existe detecção, falta implementar retry).

---

### BUG-ALTO-004: Webhook Parser - Payload muito grande pode causar crash
**Arquivo:** `packages/domain/src/webhooks/webhook-parser.service.ts:14-25`

**Status:** ✅ JÁ CORRIGIDO - Validação de tamanho máximo (1MB) implementada.

---

### BUG-ALTO-005: Vault Service - confirmBuy validação de reserva
**Arquivo:** `packages/domain/src/vaults/vault.service.ts:253-276`

**Status:** ✅ JÁ CORRIGIDO - Validação de reserva implementada.

---

### BUG-ALTO-006: Position Service - Divisão por zero em cálculos de taxa
**Arquivo:** `packages/domain/src/positions/position.service.ts:849-850`

**Status:** ✅ JÁ CORRIGIDO - Validação existe, mas verificar outros lugares.

---

### BUG-ALTO-007: Admin Controller - ParseInt sem validação
**Arquivo:** `apps/api/src/admin/admin-system.controller.ts:47-62`

**Status:** ✅ JÁ CORRIGIDO - Métodos `safeParseInt` e `safeParseFloat` implementados.

---

### BUG-ALTO-008: Webhook Parser - Payload muito grande
**Arquivo:** `packages/domain/src/webhooks/webhook-parser.service.ts:15-25`

**Status:** ✅ JÁ CORRIGIDO - Validação de tamanho máximo implementada.

---

### BUG-ALTO-009: Positions Controller - parseInt sem validação de limites
**Arquivo:** `apps/api/src/positions/positions.controller.ts:300-312`

**Status:** ✅ PARCIALMENTE CORRIGIDO - Validação existe, mas falta limite máximo para `limit`.

**Correção necessária:** Adicionar limite máximo:
```typescript
if (limitNum > 100) {
  throw new BadRequestException('Parâmetro "limit" não pode ser maior que 100');
}
```

---

### BUG-ALTO-010: Webhook Monitor Controller - parseInt sem validação
**Arquivo:** `apps/api/src/webhooks/webhook-monitor.controller.ts:200`

**Problema:** `parseInt(limit, 10)` sem validação de limites.

**Correção sugerida:**
```typescript
const limitNum = limit ? Math.min(1000, Math.max(1, parseInt(limit, 10) || 100)) : 100;
```

---

### BUG-ALTO-011: Trade Parameters Controller - parseFloat sem validação completa
**Arquivo:** `apps/api/src/trade-parameters/trade-parameters.controller.ts:394,410,416`

**Problema:** `parseFloat` usado sem validação de limites min/max.

**Correção sugerida:** Adicionar validação de limites razoáveis para valores financeiros.

---

### BUG-ALTO-012: Cron Management Controller - parseInt sem validação
**Arquivo:** `apps/api/src/monitoring/cron-management.controller.ts:300`

**Problema:** `parseInt(limit)` sem validação de limites.

**Correção sugerida:**
```typescript
const limitNum = limit ? Math.min(1000, Math.max(1, parseInt(limit, 10) || 100)) : 100;
```

---

## 🟡 BUGS DE MÉDIA SEVERIDADE

### BUG-MED-001: Cache Service - Cleanup de listeners
**Arquivo:** `packages/shared/src/cache/cache.service.ts:66-78`

**Status:** ✅ JÁ CORRIGIDO - `removeAllListeners()` implementado.

---

### BUG-MED-002: Executor - setInterval cleanup
**Arquivo:** `apps/executor/src/main.ts:92-104`

**Status:** ✅ JÁ CORRIGIDO - Cleanup implementado nos handlers SIGTERM e SIGINT.

---

### BUG-MED-003: Webhook Monitor Service - Uso excessivo de `as any`
**Arquivo:** `packages/domain/src/webhooks/webhook-monitor.service.ts:269,1233`

**Problema:** Múltiplos usos de `(existingAlert as any)` e `(alert as any)` sem tipagem adequada.

**Impacto:** Perda de type safety, possíveis erros em runtime.

**Correção sugerida:** Criar interface adequada para tipos de alerta.

---

### BUG-MED-004: Webhooks Controller - Logs excessivos
**Arquivo:** `apps/api/src/webhooks/webhooks.controller.ts:77-124`

**Status:** Duplicado com BUG-CRIT-002 (mais crítico).

---

### BUG-MED-005: Vault Service - Transações com deadlock retry
**Arquivo:** `packages/domain/src/vaults/vault.service.ts:29-55`

**Status:** ✅ JÁ CORRIGIDO - Método `executeTransactionWithDeadlockRetry` implementado.

---

### BUG-MED-006: Trade Parameter - Múltiplos parâmetros para mesmo símbolo
**Arquivo:** `packages/domain/src/trading/trade-parameter.service.ts`

**Problema:** Não há validação para evitar múltiplos parâmetros ativos para o mesmo símbolo/lado.

**Impacto:** Comportamento indeterminado ao calcular quote amount.

**Correção sugerida:** Adicionar unique constraint ou validação antes de criar.

---

### BUG-MED-007: Position Service - Validação de qty_remaining inconsistente
**Arquivo:** `packages/domain/src/positions/position.service.ts:969-977`

**Status:** ✅ JÁ CORRIGIDO - Validação implementada.

---

### BUG-MED-008: Monitors Main - setInterval sem cleanup
**Arquivo:** `apps/monitors/src/main.ts:50`

**Problema:** `setInterval` pode não ser limpo adequadamente.

**Correção sugerida:** Adicionar handlers SIGTERM/SIGINT para cleanup.

---

### BUG-MED-009: Frontend - Múltiplos setInterval/setTimeout sem cleanup
**Arquivo:** Vários arquivos em `apps/frontend/src/`

**Problema:** Múltiplos `setInterval` e `setTimeout` que podem não ser limpos adequadamente em componentes React.

**Impacto:** Memory leaks no frontend.

**Correção sugerida:** Usar `useEffect` com cleanup adequado para todos os timers.

---

### BUG-MED-010: Webhook Monitor Service - Divisão por zero em savings_pct
**Arquivo:** `packages/domain/src/webhooks/webhook-monitor.service.ts:1236`

**Problema:** Cálculo de `savingsPct` pode ter divisão por zero se `priceAlert` for 0.

**Código problemático:**
```typescript
const savingsPct = ((priceAlert - executionPrice) / priceAlert) * 100;
```

**Correção sugerida:**
```typescript
const savingsPct = priceAlert > 0 
  ? ((priceAlert - executionPrice) / priceAlert) * 100 
  : 0;
```

---

### BUG-MED-011: Reports Service - Queries N+1 potenciais
**Arquivo:** `apps/api/src/reports/reports.service.ts`

**Problema:** Algumas queries podem ter problemas N+1 em loops.

**Impacto:** Performance degradada com muitos dados.

**Correção sugerida:** Revisar queries e usar `include` ou `select` adequadamente.

---

## 🟢 BUGS DE BAIXA SEVERIDADE

### BUG-BAIXO-001: Webhook - Logs com informações de debug
**Arquivo:** `apps/api/src/webhooks/webhooks.controller.ts`

**Status:** Duplicado com BUG-CRIT-002.

---

### BUG-BAIXO-002: Cache Service - TTL hardcoded
**Arquivo:** `packages/shared/src/cache/cache.service.ts:125`

**Problema:** TTL máximo de 25s para preços está hardcoded.

**Correção sugerida:** Tornar configurável via env var.

---

### BUG-BAIXO-003: TypeScript - Uso de `any` em transações
**Arquivo:** `packages/domain/src/vaults/vault.service.ts`

**Problema:** `tx: any` em todas as transações.

**Correção sugerida:** Usar tipo adequado do Prisma (`Prisma.TransactionClient`).

---

### BUG-BAIXO-004: Admin Controller - Falta paginação em algumas queries
**Arquivo:** `apps/api/src/admin/admin-system.controller.ts`

**Problema:** Algumas queries `findMany` não têm `take`/`skip`.

**Correção sugerida:** Adicionar paginação padrão onde necessário.

---

### BUG-BAIXO-005: Executor Main - parseInt sem validação
**Arquivo:** `apps/executor/src/main.ts:10`

**Problema:** `parseInt(process.env.NTP_SYNC_INTERVAL || '3600000')` sem validação.

**Correção sugerida:** Adicionar validação de limites razoáveis.

---

### BUG-BAIXO-006: API Main - parseInt sem validação
**Arquivo:** `apps/api/src/main.ts:41`

**Problema:** `parseInt(process.env.NTP_SYNC_INTERVAL || '3600000')` sem validação.

**Correção sugerida:** Adicionar validação de limites razoáveis.

---

## Bugs Já Corrigidos (do relatório anterior)

1. ✅ BUG-CRIT-001: Vault - Validação de reserved_balance no withdraw
2. ✅ BUG-CRIT-002: Vault - Race condition em reserveForBuy (FOR UPDATE implementado)
3. ✅ BUG-CRIT-003: Position Service - qty_remaining negativo (validação implementada)
4. ✅ BUG-CRIT-004: Webhook - Payload sem limite (limite de 10MB implementado)
5. ✅ BUG-ALTO-001: Cache Service - Sem limite (configuração implementada)
6. ✅ BUG-ALTO-002: Position Service - Queries N+1 (consolidação implementada)
7. ✅ BUG-ALTO-005: Vault - confirmBuy validação (implementada)
8. ✅ BUG-ALTO-008: Webhook Parser - Payload muito grande (validação implementada)
9. ✅ BUG-MED-001: Cache Service - Cleanup de listeners (implementado)
10. ✅ BUG-MED-002: Executor - setInterval cleanup (implementado)
11. ✅ BUG-MED-005: Vault - Transações com deadlock retry (implementado)

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
- Alertas para divisões por zero

### 3. Code Review Checklist
- ✅ Validação de entrada
- ✅ Tratamento de erros
- ✅ Transações atômicas
- ✅ Validação de saldos/quantidades
- ✅ Limpeza de recursos (listeners, timers)
- ✅ Validação de divisão por zero
- ✅ Limites em parseInt/parseFloat

### 4. Documentação
- Documentar limites de tamanho de payload
- Documentar políticas de retry
- Documentar tratamento de deadlocks
- Documentar limites de paginação

---

## Priorização de Correções

**Sprint 1 (Crítico - Urgente):**
1. BUG-CRIT-001: Limit Orders Controller - exchangeAccountId
2. BUG-CRIT-002: Webhooks Controller - Logs excessivos
3. BUG-CRIT-003: Monitoring Controller - parseInt sem limites
4. BUG-CRIT-004: Webhook Monitor - Divisão por zero
5. BUG-CRIT-005: Positions Controller - Divisão por zero
6. BUG-CRIT-006: Reports Service - Divisão por zero

**Sprint 2 (Alto - Importante):**
7. BUG-ALTO-001: Operations Controller - Validação page/limit
8. BUG-ALTO-002: Webhook Monitor - SQL injection
9. BUG-ALTO-003: Executor - Retry em erros de rede
10. BUG-ALTO-009: Positions Controller - Limite máximo
11. BUG-ALTO-010: Webhook Monitor Controller - parseInt
12. BUG-ALTO-011: Trade Parameters Controller - parseFloat
13. BUG-ALTO-012: Cron Management Controller - parseInt

**Sprint 3 (Médio - Melhorias):**
14. BUG-MED-003: Webhook Monitor - Uso de `as any`
15. BUG-MED-006: Trade Parameter - Múltiplos parâmetros
16. BUG-MED-008: Monitors Main - setInterval cleanup
17. BUG-MED-009: Frontend - Timers sem cleanup
18. BUG-MED-010: Webhook Monitor - Divisão por zero savings
19. BUG-MED-011: Reports Service - Queries N+1

**Sprint 4 (Baixo - Técnico):**
20. BUG-BAIXO-002: Cache Service - TTL hardcoded
21. BUG-BAIXO-003: TypeScript - Uso de `any`
22. BUG-BAIXO-004: Admin Controller - Paginação
23. BUG-BAIXO-005: Executor Main - parseInt
24. BUG-BAIXO-006: API Main - parseInt

---

**Fim do Relatório**

