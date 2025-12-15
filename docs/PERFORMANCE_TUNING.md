# Guia de Otimização de Performance

Este documento contém as configurações recomendadas para otimizar a performance do sistema MVCash Node em um VPS com 20 núcleos e 64GB de RAM.

## MySQL 8 - Configurações Recomendadas

### Configurações Essenciais

Adicione ou modifique as seguintes configurações no arquivo `/etc/mysql/mysql.conf.d/mysqld.cnf` ou `my.cnf`:

```ini
[mysqld]
# === MEMÓRIA E BUFFER ===

# InnoDB Buffer Pool: 25% da RAM para dedicar ao buffer pool
# Para 64GB RAM, usar 16GB
innodb_buffer_pool_size = 16G

# Dividir o buffer pool em múltiplas instâncias (1 por GB até 8 instâncias)
innodb_buffer_pool_instances = 8

# Log buffer size: ajudar com transações grandes
innodb_log_buffer_size = 256M

# Redo log files: tamanho maior = melhor performance de escrita
innodb_redo_log_capacity = 2G

# === CONEXÕES ===

# Máximo de conexões simultâneas
# Fórmula: (API instances * connection_limit) + (executor * 10) + (monitors * 10) + margin
# (8 * 41) + 10 + 10 + 50 = 398, arredondar para 400
max_connections = 400

# Timeout de conexão (segundos)
wait_timeout = 600
interactive_timeout = 600

# Thread pool para melhor escalabilidade
thread_handling = pool-of-threads
thread_pool_size = 20

# === PERFORMANCE DE ESCRITA ===

# Flush log a cada segundo (não a cada transação) - melhor performance, risco mínimo
innodb_flush_log_at_trx_commit = 2

# Método de flush: O_DIRECT evita double buffering
innodb_flush_method = O_DIRECT

# IO Capacity: ajustar para SSDs
innodb_io_capacity = 2000
innodb_io_capacity_max = 4000

# Write threads
innodb_write_io_threads = 8
innodb_read_io_threads = 8

# === PERFORMANCE DE LEITURA ===

# Adaptive Hash Index: melhora queries frequentes
innodb_adaptive_hash_index = ON

# Buffer pool dump/load: restaurar cache após restart
innodb_buffer_pool_dump_at_shutdown = ON
innodb_buffer_pool_load_at_startup = ON

# === QUERIES ===

# Query cache desabilitado (MySQL 8.0+ não usa mais, removido)
# query_cache_type = 0
# query_cache_size = 0

# Join buffer e sort buffer
join_buffer_size = 4M
sort_buffer_size = 4M
read_buffer_size = 2M
read_rnd_buffer_size = 2M

# Temp tables em memória
tmp_table_size = 256M
max_heap_table_size = 256M

# === LOGS E MONITORAMENTO ===

# Slow query log para identificar queries lentas
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 0.5

# Performance schema (desabilitar se não usar para monitoramento)
# performance_schema = OFF

# === BINLOG (se usar replicação) ===
# sync_binlog = 0  # Mais performance, menos durabilidade
# binlog_format = ROW
```

### Aplicar Configurações

```bash
# Editar configuração
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf

# Reiniciar MySQL
sudo systemctl restart mysql

# Verificar se foi aplicado
mysql -u root -p -e "SHOW VARIABLES LIKE 'innodb_buffer_pool_size';"
```

## Redis - Configurações Recomendadas

### Configurações no redis.conf

```conf
# Memória máxima: 2GB para cache
maxmemory 2gb

# Política de eviction: remover chaves menos usadas
maxmemory-policy allkeys-lru

# Persistência: desabilitar se usar apenas como cache
save ""
appendonly no

# Performance
tcp-backlog 511
tcp-keepalive 300

# Threads de IO (Redis 6+)
io-threads 4
io-threads-do-reads yes
```

### Aplicar Configurações

```bash
# Editar configuração
sudo nano /etc/redis/redis.conf

# Reiniciar Redis
sudo systemctl restart redis

# Verificar via CLI
redis-cli CONFIG GET maxmemory
redis-cli CONFIG GET maxmemory-policy
```

## Prisma/Node.js - Connection Pool

### DATABASE_URL Configurada

A URL de conexão deve incluir parâmetros de pool:

```env
# Para 20 núcleos: connection_limit = (cores * 2) + 1 = 41
DATABASE_URL=mysql://user:password@localhost:3306/mvcashnode?connection_limit=41&pool_timeout=10&connect_timeout=10
```

### Parâmetros Explicados

- `connection_limit=41`: Máximo de conexões por instância do Prisma
- `pool_timeout=10`: Tempo máximo (segundos) para obter conexão do pool
- `connect_timeout=10`: Tempo máximo (segundos) para estabelecer conexão

### Considerações com Cluster PM2

Ao rodar a API em cluster mode com múltiplas instâncias:

```
Total conexões = API instances * connection_limit
Exemplo: 8 instâncias * 41 = 328 conexões potenciais

MySQL max_connections deve ser >= (Total conexões + executor + monitors + margem)
Exemplo: 328 + 10 + 10 + 52 = 400
```

## PM2 - Cluster Mode

### Configuração Otimizada (ecosystem.config.js)

```javascript
{
  name: 'mvcashnode-api',
  script: './apps/api/dist/src/main.js',
  instances: 8,  // 8 instâncias para 20 núcleos
  exec_mode: 'cluster',
  max_memory_restart: '1G',
  node_args: '--max-old-space-size=1024',
}
```

### Distribuição de Recursos (20 núcleos)

| Serviço | Instâncias | Núcleos Estimados |
|---------|------------|-------------------|
| API | 8 | 8 |
| Frontend | 4 | 4 |
| Site | 2 | 2 |
| Executor | 1 | 1 |
| Monitors | 1 | 1 |
| Backup | 1 | 1 |
| **Total** | **17** | **17** |

Sobram 3 núcleos para SO, MySQL, Redis e outros processos.

## Next.js - Otimizações de Build

### next.config.ts

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',  // Menor footprint
  compress: true,
  poweredByHeader: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-*',
      'date-fns',
      'recharts',
      'framer-motion',
      // ... outros pacotes grandes
    ],
  },
};
```

## React Query - Cache Otimizado

### Configurações Recomendadas

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,  // 30 segundos
      gcTime: 10 * 60 * 1000,  // 10 minutos
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

### Refetch Intervals por Tipo de Dados

| Tipo de Dados | Refetch Interval | staleTime |
|---------------|------------------|-----------|
| Monitor Alerts | 10s | 5s |
| Posições Abertas | 60s | 30s |
| Posições Fechadas | Sob demanda | 60s |
| Dashboard | 60s | 30s |
| Configurações | Sob demanda | 5min |

## Monitoramento de Performance

### Identificar Queries Lentas

```bash
# Ver slow query log
sudo tail -f /var/log/mysql/slow.log

# Analisar queries
pt-query-digest /var/log/mysql/slow.log
```

### Verificar Status do MySQL

```sql
-- Conexões em uso
SHOW STATUS LIKE 'Threads_connected';

-- Buffer pool usage
SHOW STATUS LIKE 'Innodb_buffer_pool%';

-- Queries por segundo
SHOW STATUS LIKE 'Questions';
```

### Verificar Performance do Redis

```bash
# Estatísticas gerais
redis-cli INFO stats

# Memória em uso
redis-cli INFO memory

# Latência
redis-cli --latency
```

## Checklist de Otimização

- [ ] MySQL: innodb_buffer_pool_size configurado (16GB)
- [ ] MySQL: max_connections adequado (400+)
- [ ] MySQL: slow_query_log habilitado
- [ ] Redis: maxmemory configurado (2GB)
- [ ] Redis: maxmemory-policy = allkeys-lru
- [ ] DATABASE_URL com connection_limit=41
- [ ] PM2: API em cluster mode (8 instâncias)
- [ ] PM2: Frontend em cluster mode (4 instâncias)
- [ ] Next.js: output = 'standalone'
- [ ] Next.js: removeConsole em produção
- [ ] React Query: staleTime aumentado (30s)
- [ ] React Query: refetchIntervals otimizados

