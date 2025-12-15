/**
 * PM2 Ecosystem Configuration
 * Otimizado para VPS com 20 núcleos e 64GB RAM
 * 
 * Distribuição de recursos (20 núcleos):
 * - API: 8 instâncias (cluster mode) - Alta demanda de requisições
 * - Frontend: 4 instâncias (cluster mode) - SSR e renderização
 * - Executor: 1 instância (fork) - Worker único para execução de trades
 * - Monitors: 1 instância (fork) - Worker único para jobs agendados
 * - Site: 2 instâncias (cluster mode) - Site público
 * - Backup: 1 instância (fork) - Worker único para backups
 * Total: ~17 instâncias, deixando margem para o SO e MySQL/Redis
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
      },
      error_file: './logs/executor-error.log',
      out_file: './logs/executor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '4096M',
      kill_timeout: 10000, // Mais tempo para finalizar trades em andamento
    },
    {
      name: 'mvcashnode-monitors',
      script: './apps/monitors/dist/main.js',
      // Fork mode - monitors devem ser únicos para evitar jobs duplicados
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/monitors-error.log',
      out_file: './logs/monitors-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '4096M',
    },
    {
      name: 'mvcashnode-frontend',
      script: 'pnpm',
      args: 'exec next start -p 5010',
      cwd: './apps/frontend',
      // Cluster mode para melhor performance SSR
      instances: 4, // 4 instâncias para renderização paralela
      exec_mode: 'cluster',
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
    {
      name: 'mvcashnode-site',
      script: 'pnpm',
      args: 'exec next start -p 6010',
      cwd: './apps/site',
      // Cluster mode para site público
      instances: 2, // 2 instâncias para o site público
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: '6010',
      },
      error_file: './logs/site-error.log',
      out_file: './logs/site-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1512M',
    },
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
