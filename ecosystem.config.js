/**
 * PM2 Ecosystem Configuration
 * Otimizado para VPS com 20 núcleos e 64GB RAM
 * 
 * Distribuição de recursos (20 núcleos):
 * - API: 8 instâncias (cluster mode) - Alta demanda de requisições
 * - Frontend: 4 instâncias (cluster mode) - SSR e renderização
 * - Executor: 1 instância (fork) - Worker único para execução de trades
 * - Monitors: 1 instância (fork) - Worker único para jobs agendados
 * - Site: Servido estaticamente pelo nginx (não precisa de PM2)
 * - Backup: 1 instância (fork) - Worker único para backups
 * Total: ~15 instâncias, deixando margem para o SO e MySQL/Redis
 * 
 * NOTA: O site (apps/site) é exportado como estático e servido pelo nginx.
 * Não precisa de processo Node.js rodando, reduzindo consumo de CPU/RAM.
 * 
 * Para aplicar mudanças: pm2 reload ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'mvcashnode-api',
      script: './apps/api/dist/src/main.js',
      // Cluster mode para aproveitar múltiplos núcleos
      instances: 8, // 8 instâncias para balanceamento de carga
      exec_mode: 'cluster',
      // Variáveis de ambiente
      env: {
        NODE_ENV: 'production',
        // Cada instância terá ~5 conexões do pool (41/8)
      },
      // Logs
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Restart policies
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Performance: reiniciar se usar mais de 1GB RAM por instância
      max_memory_restart: '2G',
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      // Node.js flags para performance
      node_args: '--max-old-space-size=1024',
    },
    {
      name: 'mvcashnode-executor',
      script: './apps/executor/dist/main.js',
      // Fork mode - executor deve ser único para evitar trades duplicados
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info', // Reduzir logs desnecessários
      },
      error_file: './logs/executor-error.log',
      out_file: './logs/executor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Reiniciar se usar mais de 2GB RAM (reduzido de 4GB)
      max_memory_restart: '2048M',
      // Reiniciar diariamente às 3h da manhã para liberar recursos
      cron_restart: '0 3 * * *',
      // Graceful shutdown - mais tempo para finalizar trades em andamento
      kill_timeout: 30000,
      // Node.js flags para otimizar CPU e memória
      node_args: [
        '--max-old-space-size=1536',
        '--gc-interval=100',
        '--optimize-for-size'
      ].join(' '),
      // Desabilitar watch de arquivos
      watch: false,
      // Desabilitar restart automático em caso de falha temporária
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'mvcashnode-monitors',
      script: './apps/monitors/dist/main.js',
      // Fork mode - monitors devem ser únicos para evitar jobs duplicados
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info', // Reduzir logs desnecessários
      },
      error_file: './logs/monitors-error.log',
      out_file: './logs/monitors-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Reiniciar se usar mais de 2GB RAM (reduzido de 4GB)
      max_memory_restart: '2048M',
      // Reiniciar diariamente às 4h da manhã para liberar recursos
      cron_restart: '0 4 * * *',
      // Graceful shutdown
      kill_timeout: 30000, // 30s para finalizar jobs em andamento
      // Node.js flags para otimizar CPU e memória
      node_args: [
        '--max-old-space-size=1536',
        '--gc-interval=100',
        '--optimize-for-size'
      ].join(' '),
      // Desabilitar watch de arquivos
      watch: false,
      // Desabilitar restart automático em caso de falha temporária
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'mvcashnode-frontend',
      script: 'pnpm',
      args: 'exec next start -p 5010',
      cwd: './apps/frontend',
      // Fork mode - Next.js não suporta cluster mode nativamente
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '5010',
        NEXT_PUBLIC_SITE_MODE: 'app',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '2G',
      kill_timeout: 5000,
    },
    // Site removido - agora é servido estaticamente pelo nginx
    // Build: cd apps/site && pnpm build
    // Output: apps/site/out/ (servir com nginx)
    {
      name: 'mvcashnode-backup',
      script: './apps/backup/dist/main.js',
      // Fork mode - backup deve ser único
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/backup-error.log',
      out_file: './logs/backup-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1512M',
    },
  ],
};
