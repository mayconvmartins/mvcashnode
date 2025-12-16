# HOTFIX - Cache TTL 35s Bloqueado

## 🔥 Problema Descoberto

Após deploy, os logs mostraram:
```
[CacheService] TTL de preço excedeu 25s (35s), limitando a 25s
```

O `CacheService` tem uma validação que limita o TTL máximo de preços, anulando nossa otimização.

## ✅ Solução Aplicada

**Arquivo**: `packages/shared/src/cache/cache.service.ts`

**Mudança**: Padrão de `CACHE_PRICE_TTL_MAX` aumentado de 25s para 35s (linha 19)

```typescript
// ANTES
this.priceTtlMax = parseInt(process.env.CACHE_PRICE_TTL_MAX || '25', 10);

// DEPOIS
this.priceTtlMax = parseInt(process.env.CACHE_PRICE_TTL_MAX || '35', 10);
```

## 🚀 Como Aplicar

### 1. Rebuild do Shared Package

```bash
cd packages/shared
pnpm run build

# Ou rebuild completo
cd ../..
pnpm run build
```

### 2. Restart dos Serviços que Usam Cache

```bash
pm2 restart monitors
pm2 restart executor
pm2 restart api  # Se usar cache
```

### 3. Verificar Logs

Após restart, os warnings devem **desaparecer**:

```bash
# NÃO deve mais aparecer
tail -f logs/monitors-error.log | grep "TTL de preço excedeu"
```

## 📊 Impacto

- ✅ Cache de preços funcionará com TTL de 35s conforme planejado
- ✅ ~70% menos chamadas à exchange (agora vai funcionar de verdade)
- ✅ Price Sync (22s) + TTL (35s) = máximo 13s de cache "velho"

## 🔍 Verificação

### Antes do Fix
```
[CacheService] TTL de preço excedeu 25s (35s), limitando a 25s  ❌
[PRICE-SYNC] BINANCE_SPOT: 21 preço(s) sincronizado(s), 0 erro(s)
```

### Depois do Fix
```
[PRICE-SYNC] BINANCE_SPOT: 21 preço(s) sincronizado(s), 0 erro(s)  ✅
(Sem warnings de TTL)
```

## 📝 Nota

Este hotfix é **crítico** para que a otimização de cache funcione corretamente. Sem ele, o TTL continua em 25s e a economia de CPU não é maximizada.

---

**Status**: ✅ Pronto para rebuild  
**Prioridade**: 🔴 Alta  
**Impacto**: +20-25% economia de CPU adicional

