# Cancelar Ordens Pendentes

## Uso Rápido

### Via Admin Dashboard

1. Acesse: **Admin > Debug Tools**
2. Clique em **"Cancelar Ordens Pendentes"**
3. Confirme a ação

### Via API

```bash
POST /admin/cancel-all-pending-orders
```

## Como Funciona

O endpoint cancela **TODAS** as ordens com status `PENDING` ou `PENDING_LIMIT`, incluindo:

- ✅ **Ordens com executions** (criadas na exchange) - Cancela na exchange E no banco
- ✅ **Ordens órfãs** (sem executions - nunca enfileiradas) - Cancela apenas no banco
- ✅ **Até 1000 ordens por vez** (configurável)

## Parâmetros

```typescript
{
  accountIds?: number[];     // Filtrar por contas específicas
  symbol?: string;           // Filtrar por símbolo (ex: "BTCUSDT")
  side?: 'BUY' | 'SELL';    // Filtrar por lado
  orderType?: 'MARKET' | 'LIMIT';  // Filtrar por tipo
  dryRun?: boolean;          // true = só visualizar, não cancela
  limit?: number;            // Máximo de ordens (padrão: 1000)
}
```

## Exemplos

### 1. Cancelar TODAS as Ordens Pendentes

```bash
curl -X POST http://localhost:5000/admin/cancel-all-pending-orders \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Resposta:**
```json
{
  "success": true,
  "message": "523 ordens canceladas (500 órfãs, 23 na exchange)",
  "total": 523,
  "orphansFound": 500,
  "withExecutions": 23,
  "canceledInDb": 523,
  "canceledInExchange": 23,
  "errors": 0
}
```

### 2. Apenas Visualizar (Dry Run)

```bash
curl -X POST http://localhost:5000/admin/cancel-all-pending-orders \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

### 3. Cancelar Apenas Ordens LIMIT

```bash
curl -X POST http://localhost:5000/admin/cancel-all-pending-orders \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderType": "LIMIT"}'
```

### 4. Cancelar de Uma Conta Específica

```bash
curl -X POST http://localhost:5000/admin/cancel-all-pending-orders \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accountIds": [1, 2]}'
```

### 5. Cancelar Muitas Ordens (Até 5000)

```bash
curl -X POST http://localhost:5000/admin/cancel-all-pending-orders \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5000}'
```

## O que Acontece Depois?

### Para Ordens SL/TP

Se uma ordem LIMIT foi criada por **Stop Loss** ou **Take Profit**:
- ✅ O monitor SL/TP verá que `sl_triggered` ou `tp_triggered` está `true`
- ✅ Não criará novamente (já foi processado)
- ⚠️  **Importante:** Se precisar reativar SL/TP, resetar as flags manualmente

### Para Novas Ordens SL/TP

- ✅ Monitores continuam funcionando normalmente
- ✅ Vão criar novas ordens quando condições forem atendidas
- ✅ Ordens serão enfileiradas automaticamente

## Logs

### No Servidor

```bash
pm2 logs mvcashnode-api | grep "ADMIN"
```

Vai mostrar:
```
[ADMIN] Encontradas 523 ordens pendentes:
[ADMIN] - 500 órfãs (sem executions - nunca foram enfileiradas)
[ADMIN] - 23 com executions (na exchange)
[ADMIN] Cancelamento concluído:
[ADMIN] - 523 canceladas no banco
[ADMIN] - 23 canceladas na exchange
[ADMIN] - 500 eram órfãs (apenas canceladas no banco)
[ADMIN] - 0 erros
```

## Quando Usar

### ✅ Use Quando:

1. **Muitas ordens órfãs acumuladas** - Logs mostrando ordens sem executions
2. **Limpeza geral** - Resetar todas as ordens pendentes
3. **Após problemas no Redis** - Ordens que nunca foram processadas
4. **Antes de manutenção** - Limpar fila de ordens

### ⚠️ Cuidado Quando:

1. **Ordens SL/TP importantes** - Vão ser canceladas e não recriadas automaticamente
2. **Trading ativo** - Pode cancelar ordens legítimas em processamento
3. **Múltiplas execuções** - Aguardar alguns segundos entre cancelamentos em massa

## Troubleshooting

### Ordens Órfãs Continuam Aparecendo

**Causa:** Monitores SL/TP estão criando mas não enfileirando

**Solução:**
1. Verificar logs do monitor:
   ```bash
   pm2 logs mvcashnode-monitors | grep "ERRO"
   ```

2. Verificar Redis:
   ```bash
   redis-cli ping
   ```

3. Se Redis estiver down:
   ```bash
   pm2 restart all
   ```

### Muitas Ordens para Cancelar

**Solução:** Cancelar em lotes

```bash
# Lote 1 (primeiras 1000)
curl -X POST .../cancel-all-pending-orders -d '{"limit": 1000}'

# Aguardar 5 segundos

# Lote 2 (próximas 1000)
curl -X POST .../cancel-all-pending-orders -d '{"limit": 1000}'
```

### Erro ao Cancelar na Exchange

```json
{
  "errors": 5,
  "errorDetails": [
    {
      "orderId": 123,
      "error": "Order not found"
    }
  ]
}
```

**Normal!** Ordem pode já ter sido executada ou cancelada na exchange.
- ✅ Será cancelada no banco mesmo assim
- ✅ Sistema continua funcionando

## Melhorias Aplicadas

### Antes (v1)
- ❌ Cancelava apenas 50 ordens por vez
- ❌ Não identificava órfãs claramente
- ❌ Lógica complexa de enfileiramento

### Depois (v2)
- ✅ Cancela até 1000 ordens (configurável até 5000)
- ✅ Identifica e mostra órfãs claramente
- ✅ Simples: apenas cancela tudo
- ✅ Logs mais claros
- ✅ Monitores recriam se necessário

## Resumo

```
┌─────────────────────────────────────────┐
│  Cancelar Ordens Pendentes              │
├─────────────────────────────────────────┤
│                                         │
│  1. Busca ordens PENDING/PENDING_LIMIT  │
│  2. Separa: com executions vs órfãs     │
│  3. Cancela na exchange (se existir)    │
│  4. Marca como CANCELED no banco        │
│  5. Monitores recriam se necessário     │
│                                         │
└─────────────────────────────────────────┘
```

**Simples e eficaz! 🎯**

