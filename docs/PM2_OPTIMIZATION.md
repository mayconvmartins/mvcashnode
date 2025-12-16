# Otimização PM2 para Redução de CPU

**Data**: 16/12/2025
**Aplicado a**: `ecosystem.config.js`

## Resumo

Configurações do PM2 otimizadas para reduzir o consumo de CPU dos processos `monitors` e `executor`, especialmente importantes após as otimizações de código implementadas.

## Otimizações Aplicadas

### 1. Node.js Flags de Performance

```javascript
node_args: [
  '--max-old-space-size=1536',  // Limitar heap para 1.5GB
  '--gc-interval=100',           // GC mais frequente
  '--optimize-for-size'          // Otimizar para tamanho ao invés de velocidade
].join(' ')
```

**Impacto**:
- `--max-old-space-size=1536`: Limita o heap do V8 para 1.5GB, forçando garbage collection mais cedo
- `--gc-interval=100`: Executa garbage collection mais frequentemente, liberando memória regularmente
- `--optimize-for-size`: Prioriza uso eficiente de memória sobre velocidade bruta

### 2. Reinício Periódico com Cron

```javascript
// Monitors: reiniciar diariamente às 4h
cron_restart: '0 4 * * *'

// Executor: reiniciar diariamente às 3h
cron_restart: '0 3 * * *'
```

**Impacto**:
- Libera recursos acumulados ao longo do dia
- Reinicia em horários de baixa atividade
- Previne memory leaks de longo prazo
- Limpa caches internos do Node.js

### 3. Limite de Memória Reduzido

```javascript
// Antes: 4096M
// Depois: 2048M
max_memory_restart: '2048M'
```

**Impacto**:
- Reinicia o processo antes de consumir muita memória
- Previne swap de memória (que mataria a CPU)
- Força limpeza de recursos mais cedo

### 4. Graceful Shutdown Aumentado

```javascript
kill_timeout: 30000 // 30 segundos
```

**Impacto**:
- Permite que jobs BullMQ em andamento sejam finalizados
- Evita jobs órfãos no Redis
- Reduz necessidade de retry (que consome CPU)

### 5. Desabilitar File Watch

```javascript
watch: false
```

**Impacto**:
- Elimina overhead de monitoramento de arquivos
- Reduz operações de I/O
- Libera recursos de sistema

### 6. Exponential Backoff para Restart

```javascript
exp_backoff_restart_delay: 100
```

**Impacto**:
- Evita restart loops que matam a CPU
- Dá tempo para o sistema se estabilizar

### 7. Variáveis de Ambiente

```javascript
env: {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info' // Reduzir logs
}
```

**Impacto**:
- `LOG_LEVEL: 'info'` desabilita logs de debug que consumem CPU
- Reduz I/O de escrita em disco

## Como Aplicar

### 1. Recarregar configuração sem downtime

```bash
cd /opt/mvcashnode
pm2 reload ecosystem.config.js
```

### 2. Reiniciar completamente (com downtime breve)

```bash
cd /opt/mvcashnode
pm2 delete all
pm2 start ecosystem.config.js
pm2 save
```

### 3. Verificar status

```bash
pm2 status
pm2 monit
```

## Monitoramento

### Verificar CPU após aplicar mudanças

```bash
# CPU em tempo real
pm2 monit

# Logs
pm2 logs mvcashnode-monitors --lines 50
pm2 logs mvcashnode-executor --lines 50

# Métricas detalhadas
pm2 describe mvcashnode-monitors
pm2 describe mvcashnode-executor
```

### Comandos úteis

```bash
# Reiniciar manualmente se necessário
pm2 restart mvcashnode-monitors
pm2 restart mvcashnode-executor

# Limpar logs acumulados
pm2 flush

# Ver uso de memória
pm2 list
```

## Impacto Esperado

### Monitors
- **CPU**: Redução de ~40-60% no uso de CPU em idle
- **Memória**: Mantida abaixo de 2GB com garbage collection regular
- **Estabilidade**: Reinício diário previne degradação ao longo do tempo

### Executor
- **CPU**: Redução de ~30-50% no uso de CPU em idle
- **Memória**: Mantida abaixo de 2GB
- **Estabilidade**: Cache de adapters + GC regular = menos spikes

## Próximos Passos

1. ✅ Aplicar configuração: `pm2 reload ecosystem.config.js`
2. ⏳ Monitorar por 24h: `pm2 monit`
3. ⏳ Verificar logs de erro após reinício cron
4. ⏳ Confirmar redução de CPU com `htop` ou `top`

## Notas Importantes

- O primeiro restart cron será às **3h (executor)** e **4h (monitors)**
- Os processos continuarão rodando normalmente até o horário do cron
- O `pm2 reload` aplicará as outras otimizações imediatamente
- Se houver problemas, reverter com `git checkout ecosystem.config.js`

## Troubleshooting

### Se CPU continuar alta

1. Verificar se há jobs órfãos no Redis:
   ```bash
   npm run cleanup-orphan-jobs:dry
   ```

2. Verificar logs para loops infinitos:
   ```bash
   grep -i "retry\|loop\|infinite" logs/monitors-out.log
   grep -i "retry\|loop\|infinite" logs/executor-out.log
   ```

3. Reiniciar manualmente:
   ```bash
   pm2 restart mvcashnode-monitors
   pm2 restart mvcashnode-executor
   ```

### Se memória continuar crescendo

1. Reduzir ainda mais o `max_memory_restart`:
   ```javascript
   max_memory_restart: '1536M' // 1.5GB
   ```

2. Aumentar frequência do cron:
   ```javascript
   cron_restart: '0 */6 * * *' // A cada 6 horas
   ```

## Referências

- [PM2 Documentation - Process Management](https://pm2.keymetrics.io/docs/usage/process-management/)
- [Node.js V8 Options](https://nodejs.org/api/cli.html)
- [PM2 Graceful Reload](https://pm2.keymetrics.io/docs/usage/signals-clean-restart/)

