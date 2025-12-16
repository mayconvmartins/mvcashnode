# Otimizações de CPU Completas - Monitor + Executor

## ✅ Status: IMPLEMENTAÇÃO COMPLETA

Ambos os planos de otimização foram implementados com sucesso:
1. ✅ **Processo Monitor** - 9 otimizações
2. ✅ **Processo Executor** - 6 otimizações

---

## 📊 Resumo Executivo

### **Monitor** (apps/monitors)
- **Problema**: Múltiplos jobs rodando em intervalos curtos (22s-60s)
- **Solução**: Cache otimizado, batch processing, queries específicas
- **Redução Esperada**: **40-60% de CPU**

### **Executor** (apps/executor)
- **Problema**: Loop infinito de retry + 30+ jobs órfãos no Redis
- **Solução**: Reverter flags triggered, desabilitar retry, cache adapters
- **Redução Esperada**: **60-80% de CPU**

---

## 🎯 Otimizações Críticas (DEVEM SER APLICADAS)

### Monitor

| # | Otimização | Impacto | Arquivo |
|---|-----------|---------|---------|
| 1 | Duplicação de métricas removida | 5-8% | `apps/monitors/src/main.ts` |
| 2 | Cache TTL aumentado (25s→35s) | 20-25% | Todos processors |
| 3 | Batch processing SL/TP | 15-20% | `sltp-monitor-*.processor.ts` |
| 4 | Queries com select específico | 15-20% | Todos processors |

### Executor

| # | Otimização | Impacto | Arquivo |
|---|-----------|---------|---------|
| 1 | **Reverter flags triggered** | 40-50% | `trade-execution-real.processor.ts` |
| 2 | **Desabilitar retry automático** | 30-40% | `trade-execution.module.ts` + monitors |
| 3 | Cache de adapters | 10-15% | `trade-execution-real.processor.ts` |

---

## 🚀 Deploy - Ordem Recomendada

### **Passo 1: Backup**
```bash
# Backup do banco (se aplicável)
mysqldump -u user -p database > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup do Redis (opcional mas recomendado)
redis-cli -h localhost -p 6379 -a SENHA SAVE
```

### **Passo 2: Configurar Connection Pool (Manual)**
Edite `.env` ou variável de ambiente:

```env
DATABASE_URL="mysql://user:pass@host:port/db?connection_limit=20&pool_timeout=20&connect_timeout=10"
```

Ver detalhes em: [`docs/CPU_OPTIMIZATION_CONFIG.md`](CPU_OPTIMIZATION_CONFIG.md)

### **Passo 3: Rebuild**
```bash
# No diretório raiz
pnpm run build

# Ou rebuild específico
cd apps/monitors && pnpm run build
cd apps/executor && pnpm run build
```

### **Passo 4: Limpar Jobs Órfãos (CRÍTICO para Executor)**
```bash
# ANTES de restart do executor, limpar Redis
pnpm exec ts-node scripts/cleanup-orphan-jobs.ts --dry-run

# Se OK, executar
pnpm exec ts-node scripts/cleanup-orphan-jobs.ts
```

### **Passo 5: Restart dos Serviços**
```bash
# Via PM2
pm2 restart monitors
pm2 restart executor

# Ou via systemctl
systemctl restart monitors
systemctl restart executor
```

### **Passo 6: Monitorar (primeiras 2 horas)**
```bash
# CPU
pm2 monit

# Logs
tail -f logs/monitor-error.log
tail -f logs/executor-error.log

# Jobs no Redis
redis-cli -h localhost -p 6379 -a SENHA keys "bull:trade-execution-real:*" | wc -l
```

---

## 📈 Métricas de Sucesso

### Monitor
- [ ] CPU < 30% em operação normal
- [ ] Jobs completando em < 2s (média)
- [ ] Cache hit rate > 70% para preços
- [ ] Zero duplicação de métricas

### Executor
- [ ] CPU < 20% em idle, < 40% sob carga
- [ ] Zero jobs acumulados no Redis após 1h
- [ ] Nenhum job falhando em loop
- [ ] Flags `*_triggered` revertidas quando job falha

### Queries SQL de Verificação

```sql
-- 1. Verificar jobs falhando em loop
SELECT 
  tj.id,
  tj.status,
  tj.reason_code,
  tj.created_at,
  tp.sl_triggered,
  tp.tp_triggered
FROM trade_jobs tj
LEFT JOIN trade_positions tp ON tp.id = tj.position_id_to_close
WHERE tj.status = 'FAILED'
  AND tj.reason_code = 'MIN_PROFIT_NOT_MET_PRE_ORDER'
  AND tj.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
ORDER BY tj.created_at DESC
LIMIT 10;

-- 2. Verificar latência média dos jobs
SELECT 
  jc.name,
  AVG(je.duration_ms) as avg_duration_ms,
  MAX(je.duration_ms) as max_duration_ms,
  COUNT(*) as executions
FROM cron_job_executions je
JOIN cron_job_configs jc ON jc.id = je.job_config_id
WHERE je.started_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
  AND je.status = 'SUCCESS'
GROUP BY jc.name
ORDER BY avg_duration_ms DESC;

-- 3. Verificar métricas de CPU do monitor
SELECT 
  service_name,
  AVG(cpu_usage) as avg_cpu,
  MAX(cpu_usage) as max_cpu,
  AVG(memory_usage) as avg_mem_mb
FROM system_monitoring_logs
WHERE service_name IN ('MONITORS', 'EXECUTOR')
  AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY service_name;
```

---

## 📚 Documentação Detalhada

Cada processo tem sua documentação completa:

### Monitor
- [`docs/CPU_OPTIMIZATION_SUMMARY.md`](CPU_OPTIMIZATION_SUMMARY.md) - Detalhes das 9 otimizações
- [`docs/CPU_OPTIMIZATION_CONFIG.md`](CPU_OPTIMIZATION_CONFIG.md) - Configuração do connection pool

### Executor
- [`docs/EXECUTOR_CPU_OPTIMIZATION_SUMMARY.md`](EXECUTOR_CPU_OPTIMIZATION_SUMMARY.md) - Detalhes das 6 otimizações
- [`scripts/cleanup-orphan-jobs.ts`](../scripts/cleanup-orphan-jobs.ts) - Script de limpeza

---

## ⚠️ Troubleshooting

### Problema: CPU ainda alta no Monitor

1. Verificar se connection pool foi configurado:
   ```bash
   echo $DATABASE_URL | grep "connection_limit"
   ```

2. Verificar cache hit rate:
   ```bash
   redis-cli -h localhost -p 6379 -a SENHA INFO stats | grep hits
   ```

3. Verificar logs para jobs lentos:
   ```bash
   grep "duration.*ms" logs/monitor-error.log | tail -20
   ```

### Problema: CPU ainda alta no Executor

1. Verificar se há jobs acumulados:
   ```bash
   redis-cli -h localhost -p 6379 -a SENHA keys "bull:trade-execution-real:*" | wc -l
   ```

2. Verificar se flags estão sendo revertidas:
   ```bash
   grep "Flags revertidas" logs/executor-error.log | tail -10
   ```

3. Executar cleanup novamente:
   ```bash
   pnpm exec ts-node scripts/cleanup-orphan-jobs.ts
   ```

### Problema: Jobs não executando

1. Verificar status das filas BullMQ:
   ```bash
   redis-cli -h localhost -p 6379 -a SENHA LLEN "bull:trade-execution-real:waiting"
   redis-cli -h localhost -p 6379 -a SENHA LLEN "bull:trade-execution-real:active"
   ```

2. Verificar logs:
   ```bash
   tail -f logs/executor-error.log | grep "ERRO"
   ```

3. Restart se necessário:
   ```bash
   pm2 restart executor
   ```

---

## 🎉 Resultado Final

### Antes
- **Monitor**: CPU 60-80%, múltiplas queries duplicadas, cache ineficiente
- **Executor**: CPU 80-100%, loop infinito, 30+ jobs órfãos no Redis

### Depois (Esperado)
- **Monitor**: CPU 20-30%, cache otimizado, batch processing
- **Executor**: CPU 15-25%, zero loops, Redis limpo

### Impacto Total
- **Redução de CPU**: 50-70% em ambos processos
- **Queries ao banco**: ~40% menos
- **Chamadas à exchange**: ~70% menos
- **Jobs órfãos**: Zero

---

## 📅 Próximos Passos (Opcional)

### Fase 3 - Performance Avançada (Se necessário)

1. **Concurrency no Executor**
   - Aumentar para `concurrency: 2` se CPU continuar baixa
   - Arquivo: `trade-execution-real.processor.ts`
   - Risco: Race conditions

2. **Índices Adicionais no Banco**
   - Criar índices compostos para queries frequentes
   - Analisar slow query log

3. **Redis Clustering**
   - Se Redis virar gargalo
   - Separar cache de preços da fila de jobs

---

## ✅ Checklist Final

- [ ] Backup realizado
- [ ] Connection pool configurado na `DATABASE_URL`
- [ ] Build completo executado (`pnpm run build`)
- [ ] Script de cleanup executado
- [ ] Serviços reiniciados
- [ ] Monitoramento ativo por 2 horas
- [ ] Métricas de CPU verificadas
- [ ] Jobs no Redis verificados (deve ser ~0)
- [ ] Logs verificados (sem erros críticos)
- [ ] Documentação revisada

---

**Autor**: Sistema de Otimização de CPU  
**Data**: Dezembro 2025  
**Status**: ✅ Pronto para Deploy  
**Versão**: 1.0

