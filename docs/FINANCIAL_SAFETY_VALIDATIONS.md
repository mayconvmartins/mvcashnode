# Validações de Segurança Financeira

Este documento descreve todas as validações de segurança implementadas para prevenir perdas financeiras no sistema de trading.

## Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUXO DE VALIDAÇÕES DE SEGURANÇA                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Criação do Job]                                                           │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────┐                            │
│  │         ENFILEIRAMENTO (API)                │                            │
│  │  ✅ Validar status (não reprocessar)        │                            │
│  │  ✅ Validar conta ativa                     │                            │
│  │  ✅ Validar quantidade (SELL)               │                            │
│  │  ✅ Verificar duplicata na fila             │                            │
│  └─────────────────────────────────────────────┘                            │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────┐                            │
│  │      EXECUTOR (Pré-Ordem)                   │                            │
│  │  ✅ Validar posição existe (SELL)           │                            │
│  │  ✅ Validar posição está OPEN               │                            │
│  │  ✅ Validar quantidade vs posição           │                            │
│  │  ✅ Validar lucro mínimo (LIMIT SELL)       │                            │
│  │  ✅ Dupla verificação de quantidade         │                            │
│  │  ✅ Verificar ordem duplicada na exchange   │                            │
│  └─────────────────────────────────────────────┘                            │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────┐                            │
│  │      EXECUTOR (Pós-Ordem)                   │                            │
│  │  ✅ Validar quantidade executada vs posição │                            │
│  │  ✅ Verificar se posição já foi fechada     │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Validações Implementadas

### 1. Enfileiramento (TradeJobQueueService)

**Arquivo:** `apps/api/src/trade-jobs/trade-job-queue.service.ts`

| Validação | Código de Erro | Descrição |
|-----------|---------------|-----------|
| Status Final | N/A (retorno silencioso) | Jobs em status FILLED, FAILED, CANCELED, etc. não são enfileirados novamente |
| Conta Ativa | Exception | Conta de exchange deve estar ativa |
| Quantidade SELL | Exception | Jobs de SELL devem ter `base_quantity` > 0 |
| Duplicata na Fila | N/A (retorno silencioso) | Jobs já na fila não são duplicados |

**Logs de Segurança:**
```
[SEGURANÇA] Trade job {id} já está em status final ({status}), não enfileirando
[SEGURANÇA] Trade job {id} - Conta de exchange {id} está INATIVA
[SEGURANÇA] Trade job {id} - SELL sem base_quantity válida
[SEGURANÇA] ✅ Trade job {id} passou em todas as validações
```

### 2. Executor REAL (Pré-Ordem)

**Arquivo:** `apps/executor/src/trade-execution/processors/trade-execution-real.processor.ts`

| Validação | Código de Erro | Descrição |
|-----------|---------------|-----------|
| Posição Existe | `POSITION_NOT_FOUND` | Para SELL, posição deve existir |
| Posição OPEN | `POSITION_NOT_OPEN` | Posição deve estar com status OPEN |
| Quantidade Posição | `POSITION_NO_QUANTITY` | Posição deve ter `qty_remaining` > 0 |
| Quantidade vs Posição | Ajuste automático | `base_quantity` não pode exceder `qty_remaining` |
| Lucro Mínimo | `MIN_PROFIT_NOT_MET_PRE_ORDER` | Para LIMIT SELL, valida lucro mínimo ANTES de criar ordem |
| Quantidade Final | `INVALID_QUANTITY` | Quantidade não pode ser zero, negativa ou NaN |
| Dust | `DUST_AMOUNT` | Quantidade muito pequena (< 0.00001) |
| Excede Posição | `QUANTITY_EXCEEDS_POSITION` | Quantidade final não pode exceder posição |
| Duplicata Exchange | `DUPLICATE_ORDER_EXACT` | Ordem com mesmo preço/quantidade já existe |

**Logs de Segurança:**
```
[EXECUTOR] [SEGURANÇA] Job {id} - Validando posição {id} ANTES de processar...
[EXECUTOR] [SEGURANÇA] ❌ Job {id} - Posição {id} NÃO ENCONTRADA
[EXECUTOR] [SEGURANÇA] ✅ Job {id} - Posição {id} validada
[EXECUTOR] [SEGURANÇA] Job {id} - Dupla verificação de quantidade final...
[EXECUTOR] [SEGURANÇA] ✅ VALIDAÇÃO FINAL: Criando ordem...
```

### 3. Executor REAL (Pós-Ordem)

| Validação | Descrição |
|-----------|-----------|
| Posição Fechada | Se posição já foi fechada, não chama `onSellExecuted` |
| Quantidade Executada | Ajusta quantidade executada se exceder posição restante |

### 4. Executor SIM

**Arquivo:** `apps/executor/src/trade-execution/processors/trade-execution-sim.processor.ts`

As mesmas validações do executor REAL são aplicadas, com prefixo `[EXECUTOR-SIM]`.

## Códigos de Erro

| Código | Severidade | Descrição |
|--------|-----------|-----------|
| `POSITION_NOT_FOUND` | SKIPPED | Posição alvo não existe |
| `POSITION_NOT_OPEN` | SKIPPED | Posição não está aberta |
| `POSITION_NO_QUANTITY` | SKIPPED | Posição sem quantidade restante |
| `INVALID_QUANTITY` | FAILED | Quantidade inválida (zero, negativa, NaN) |
| `DUST_AMOUNT` | SKIPPED | Quantidade muito pequena |
| `QUANTITY_EXCEEDS_POSITION` | FAILED | Quantidade excede posição |
| `MIN_PROFIT_NOT_MET_PRE_ORDER` | FAILED | Lucro mínimo não atendido antes de criar ordem |
| `DUPLICATE_ORDER_EXACT` | FAILED | Ordem duplicata detectada na exchange |
| `POSITION_ALREADY_CLOSED` | INFO | Posição já estava fechada |

## Monitoramento

### Logs para Monitorar

Filtrar logs que contêm `[SEGURANÇA]` para acompanhar todas as validações:

```bash
# Ver todas as validações de segurança
pm2 logs mvcashnode-executor | grep "\[SEGURANÇA\]"

# Ver apenas falhas de segurança
pm2 logs mvcashnode-executor | grep "\[SEGURANÇA\].*❌"

# Ver validações que passaram
pm2 logs mvcashnode-executor | grep "\[SEGURANÇA\].*✅"
```

### Queries de Monitoramento

```sql
-- Jobs que falharam por validação de segurança
SELECT 
  id, 
  status, 
  reason_code, 
  reason_message, 
  created_at
FROM trade_jobs 
WHERE reason_code IN (
  'POSITION_NOT_FOUND',
  'POSITION_NOT_OPEN', 
  'POSITION_NO_QUANTITY',
  'INVALID_QUANTITY',
  'DUST_AMOUNT',
  'QUANTITY_EXCEEDS_POSITION',
  'MIN_PROFIT_NOT_MET_PRE_ORDER',
  'DUPLICATE_ORDER_EXACT'
)
ORDER BY created_at DESC
LIMIT 100;

-- Contagem de erros por tipo (últimas 24h)
SELECT 
  reason_code,
  COUNT(*) as count
FROM trade_jobs
WHERE status IN ('FAILED', 'SKIPPED')
  AND reason_code IS NOT NULL
  AND created_at > NOW() - INTERVAL 24 HOUR
GROUP BY reason_code
ORDER BY count DESC;
```

## Métricas de Sucesso

Após implementação das validações:

- Zero execuções de ordens com quantidade inválida
- Zero execuções de ordens que violam lucro mínimo
- Zero execuções de ordens para posições inexistentes
- Redução de 100% em reprocessamento de jobs já finalizados
- Logs claros de todas as validações falhadas

## Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 2025-12-15 | Implementação completa das validações de segurança financeira |

