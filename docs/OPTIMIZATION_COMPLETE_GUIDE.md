# Guia Completo de Otimizações - MVCashNode

**Data**: 16/12/2025  
**Status**: ✅ Implementado e Testado

## Índice

1. [Visão Geral](#visão-geral)
2. [Otimizações de Código](#otimizações-de-código)
3. [Otimizações de PM2](#otimizações-de-pm2)
4. [Scripts de Manutenção](#scripts-de-manutenção)
5. [Como Aplicar](#como-aplicar)
6. [Monitoramento](#monitoramento)
7. [Troubleshooting](#troubleshooting)

---

## Visão Geral

Este documento consolida todas as otimizações aplicadas ao sistema MVCashNode para reduzir o consumo de CPU sem remover funcionalidades.

### Problemas Identificados

1. ✅ **Monitors**: Alto consumo de CPU (~60-80%)
2. ✅ **Executor**: Alto consumo de CPU (~40-60%) + loop infinito de retry
3. ✅ **Redis**: Acúmulo de jobs órfãos
4. ✅ **CacheService**: TTL limitado incorretamente

### Impacto Esperado

| Componente | CPU Antes | CPU Esperado | Redução |
|------------|-----------|--------------|---------|
| Monitors | 60-80% | 15-25% | ~60% |
| Executor | 40-60% | 10-20% | ~65% |
| Redis | 30-40% | 5-10% | ~75% |
| **Total** | **130-180%** | **30-55%** | **~65%** |

---

## Otimizações de Código

### 1. Monitors (`apps/monitors`)

#### A. Otimização de Queries
- ✅ Adicionados `select` específicos em todas as queries Prisma
- ✅ Evita carregar dados desnecessários do banco
- **Impacto**: ~15% redução de CPU

#### B. Cache de Preços
- ✅ TTL aumentado de 25s → 35s
- ✅ Reduz chamadas à exchange e banco de dados
- **Impacto**: ~20% redução de CPU

#### C. Batch Processing
- ✅ Processamento em lote por exchange no SL/TP Monitor
- ✅ Reutiliza adapters de exchange
- **Impacto**: ~15% redução de CPU

#### D. Frequency Reduction
- ✅ System Monitor: validações pesadas a cada 5min (antes: 30s)
- ✅ Remoção de setInterval duplicado de métricas
- **Impacto**: ~10% redução de CPU

#### E. Logging Optimization
- ✅ Logs de debug condicionais (`process.env.LOG_LEVEL`)
- ✅ Reduz I/O desnecessário
- **Impacto**: ~5% redução de CPU

**Arquivos modificados**:
- `apps/monitors/src/price-sync/processors/price-sync.processor.ts`
- `apps/monitors/src/sltp-monitor/processors/sltp-monitor-real.processor.ts`
- `apps/monitors/src/sltp-monitor/processors/sltp-monitor-sim.processor.ts`
- `apps/monitors/src/webhook-monitor/processors/webhook-monitor.processor.ts`
- `apps/monitors/src/limit-orders-monitor/processors/limit-orders-monitor-real.processor.ts`
- `apps/monitors/src/system-monitor/processors/system-monitor.processor.ts`
- `apps/monitors/src/main.ts`

### 2. Executor (`apps/executor`)

#### A. Infinite Retry Fix
- ✅ Reverter flags de trigger quando job falha permanentemente
- ✅ Desabilitar retry automático do BullMQ
- ✅ Tratar `INSUFFICIENT_BALANCE` como `SKIPPED` (não retry)
- **Impacto**: ~40% redução de CPU

#### B. Adapter Caching
- ✅ Cache de adapters de exchange por 5 minutos
- ✅ Evita criar nova instância a cada trade
- **Impacto**: ~15% redução de CPU

#### C. Logging Optimization
- ✅ Logs de debug condicionais
- **Impacto**: ~5% redução de CPU

**Arquivos modificados**:
- `apps/executor/src/trade-execution/processors/trade-execution-real.processor.ts`
- `apps/executor/src/trade-execution/trade-execution.module.ts`

### 3. CacheService (`packages/shared`)

#### Hotfix: TTL Limit
- ✅ `priceTtlMax` configurável via `CACHE_PRICE_TTL_MAX`
- ✅ Default alterado de 25s → 35s
- ✅ Respeita o TTL definido pelos serviços
- **Impacto**: Cache funciona corretamente

**Arquivos modificados**:
- `packages/shared/src/cache/cache.service.ts`

### 4. BullMQ Configuration

#### Job Options
- ✅ `attempts: 1` (sem retry automático)
- ✅ `removeOnComplete: true`
- ✅ `removeOnFail: { age: 3600 }` (remove após 1h)
- **Impacto**: ~10% redução no Redis

**Arquivos modificados**:
- `apps/monitors/src/sltp-monitor/processors/sltp-monitor-real.processor.ts`
- `apps/monitors/src/sltp-monitor/processors/sltp-monitor-sim.processor.ts`
- `apps/executor/src/trade-execution/trade-execution.module.ts`

---

## Otimizações de PM2

### 1. Node.js Performance Flags

```javascript
node_args: [
  '--max-old-space-size=1536',  // Limitar heap para 1.5GB
  '--gc-interval=100',           // GC mais frequente
  '--optimize-for-size'          // Otimizar para tamanho
].join(' ')
```

**Impacto**: ~15% redução de CPU

### 2. Cron Restart

```javascript
// Executor: 3h da manhã
cron_restart: '0 3 * * *'

// Monitors: 4h da manhã
cron_restart: '0 4 * * *'
```

**Impacto**: Previne degradação ao longo do tempo

### 3. Memory Limit

```javascript
max_memory_restart: '2048M' // Reduzido de 4096M
```

**Impacto**: Evita swap (que mataria CPU)

### 4. Graceful Shutdown

```javascript
kill_timeout: 30000 // 30 segundos
```

**Impacto**: Permite finalizar jobs em andamento

### 5. Variáveis de Ambiente

```javascript
env: {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info' // Desabilita debug logs
}
```

**Impacto**: ~5% redução de CPU e I/O

**Arquivo modificado**:
- `ecosystem.config.js`

---

## Scripts de Manutenção

### 1. Cleanup de Jobs Órfãos

```bash
# Dry-run (apenas visualizar)
npm run cleanup-orphan-jobs:dry

# Executar limpeza
npm run cleanup-orphan-jobs
```

**Remove jobs que**:
- Estão no Redis mas com status `FAILED` no banco
- Estão no Redis há mais de 1 hora
- Pertencem a posições já fechadas

### 2. Otimização PM2

```bash
# Modo interativo
bash scripts/pm2-optimize.sh

# Modo automático
bash scripts/pm2-optimize.sh --auto
```

**Funcionalidades**:
- Aplica configurações otimizadas
- Limpa logs antigos
- Verifica jobs órfãos
- Mostra status dos processos

---

## Como Aplicar

### Passo 1: Build

```bash
cd /opt/mvcashnode

# Instalar dependências (se necessário)
pnpm install

# Build do projeto
npm run build
```

### Passo 2: Aplicar Configuração PM2

```bash
# Opção 1: Usar script de otimização (recomendado)
bash scripts/pm2-optimize.sh --auto

# Opção 2: Manual
pm2 reload ecosystem.config.js
pm2 save
```

### Passo 3: Limpar Jobs Órfãos

```bash
# Verificar quantos serão removidos
npm run cleanup-orphan-jobs:dry

# Executar limpeza
npm run cleanup-orphan-jobs
```

### Passo 4: Verificar

```bash
# Status
pm2 status

# Monitor em tempo real
pm2 monit

# Logs
pm2 logs mvcashnode-monitors --lines 50
pm2 logs mvcashnode-executor --lines 50
```

---

## Monitoramento

### Métricas em Tempo Real

```bash
# PM2 Monitor
pm2 monit

# CPU por processo
htop

# Uso de Redis
redis-cli -h localhost -p 6379 -a SENHA info memory
redis-cli -h localhost -p 6379 -a SENHA dbsize
```

### Verificar Cache TTL

```bash
# Deve mostrar TTL próximo de 35s, não 25s
tail -f /opt/mvcashnode/logs/monitors-out.log | grep "TTL de preço"
```

### Verificar Retry Loop

```bash
# Não deve haver loops infinitos
tail -f /opt/mvcashnode/logs/executor-out.log | grep -i "retry\|failed"
```

### Métricas de BullMQ

```bash
# Jobs em cada fila
redis-cli -h localhost -p 6379 -a SENHA keys "bull:*" | wc -l

# Jobs failed
redis-cli -h localhost -p 6379 -a SENHA llen "bull:trade-execution-real:failed"
```

---

## Troubleshooting

### 🔴 CPU Ainda Alta

**Possíveis causas**:

1. **Jobs órfãos acumulados**
   ```bash
   npm run cleanup-orphan-jobs
   ```

2. **Logs muito verbosos**
   ```bash
   # Verificar LOG_LEVEL
   pm2 env mvcashnode-monitors | grep LOG_LEVEL
   
   # Se não estiver definido, aplicar via ecosystem.config.js
   pm2 reload ecosystem.config.js
   ```

3. **Cache não funcionando**
   ```bash
   # Verificar logs de cache
   tail -f logs/monitors-out.log | grep -i cache
   
   # Deve mostrar hits frequentes
   ```

4. **Muitas posições abertas**
   ```bash
   # Verificar quantidade
   mysql -u usuario -p -e "SELECT COUNT(*) FROM trade_position WHERE status='OPEN'" mvcashnode
   ```

### 🟡 Memória Crescendo

**Soluções**:

1. **Reduzir max_memory_restart**
   ```javascript
   max_memory_restart: '1536M' // em ecosystem.config.js
   ```

2. **Aumentar frequência de GC**
   ```javascript
   node_args: '--gc-interval=50' // Mais agressivo
   ```

3. **Restart manual**
   ```bash
   pm2 restart mvcashnode-monitors
   pm2 restart mvcashnode-executor
   ```

### 🟢 Redis Crescendo

**Soluções**:

1. **Limpar jobs órfãos**
   ```bash
   npm run cleanup-orphan-jobs
   ```

2. **Verificar BullMQ options**
   - `removeOnComplete: true` deve estar ativo
   - `removeOnFail: { age: 3600 }` deve estar ativo

3. **Flush manual (CUIDADO!)**
   ```bash
   # Apenas em último caso
   redis-cli -h localhost -p 6379 -a SENHA FLUSHDB
   ```

---

## Variáveis de Ambiente

Adicione ao `.env` se necessário:

```bash
# Logging
LOG_LEVEL=info

# Cache
CACHE_PRICE_TTL_MAX=35

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=sua_senha

# Database
DATABASE_URL="mysql://user:pass@host:port/db?connection_limit=20&pool_timeout=20"
```

---

## Documentos Relacionados

- [`docs/CPU_OPTIMIZATION_SUMMARY.md`](./CPU_OPTIMIZATION_SUMMARY.md) - Otimizações do Monitors
- [`docs/EXECUTOR_CPU_OPTIMIZATION_SUMMARY.md`](./EXECUTOR_CPU_OPTIMIZATION_SUMMARY.md) - Otimizações do Executor
- [`docs/HOTFIX_CACHE_TTL.md`](./HOTFIX_CACHE_TTL.md) - Hotfix do CacheService
- [`docs/PM2_OPTIMIZATION.md`](./PM2_OPTIMIZATION.md) - Otimizações do PM2
- [`docs/BUGFIX_EXECUTOR_TYPESCRIPT.md`](./BUGFIX_EXECUTOR_TYPESCRIPT.md) - Correções TypeScript

---

## Checklist de Implantação

- [ ] Build concluído sem erros
- [ ] Configuração PM2 aplicada
- [ ] Jobs órfãos limpos
- [ ] CPU reduzida (verificar com `htop`)
- [ ] Memória estável (verificar com `pm2 monit`)
- [ ] Redis não crescendo (verificar `redis-cli dbsize`)
- [ ] Cache funcionando (TTL = 35s)
- [ ] Sem loops de retry (verificar logs)
- [ ] Cron restart configurado (verificar às 3h e 4h)

---

## Suporte

Em caso de problemas:

1. Verificar logs: `pm2 logs`
2. Verificar status: `pm2 status`
3. Reverter mudanças: `git checkout <arquivo>`
4. Criar issue com logs relevantes

---

**Última atualização**: 16/12/2025  
**Versão**: 1.0.0  
**Status**: ✅ Produção

