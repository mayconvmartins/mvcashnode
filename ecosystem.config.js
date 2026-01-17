/**
 * PM2 Ecosystem Configuration - v2.1.2
 * Otimizado para VPS com 20 núcleos e 64GB RAM
 * 
 * ⚠️ SEGURANÇA CRÍTICA - NÃO RODAR COMO ROOT!
 * Vulnerabilidades como CVE-2025-55182 (React2Shell) permitem RCE via Next.js.
 * Se PM2 rodar como root, o atacante ganha acesso total ao sistema.
 * 
 * Configuração recomendada no servidor:
 *   useradd -m -s /bin/bash mvcash
 *   chown -R mvcash:mvcash /opt/mvcashnode
 *   su - mvcash -c "cd /opt/mvcashnode && pm2 start ecosystem.config.js"
 * 
 * ⚠️ IMPORTANTE: Flags de heap movidas para NODE_OPTIONS (não node_args)
 * Isso evita SIGKILL no spawn em ambientes VMware/kernel 5.15+
 * 
 * Distribuição de recursos (20 núcleos):
 * - API: 4 instâncias (cluster mode) - Iniciar conservador, escalar depois
 * - Frontend: 1 instância (fork) - Next.js
 * - Executor: 1 instância (fork) - Worker único para execução de trades
 * - Monitors: 2 instâncias (cluster mode) - Workers BullMQ
 * - Backup: 1 instância (fork) - Worker único para backups
 * 
 * Para escalar após estabilizar: pm2 scale mvcashnode-api 8
 * Para aplicar mudanças: pm2 reload ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'mvcashnode-api',
      script: './apps/api/dist/src/main.js',
      // Cluster mode - iniciar com menos instâncias, escalar depois
      instances: 4,
      exec_mode: 'cluster',
      // Variáveis de ambiente - heap via NODE_OPTIONS (não node_args!)
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=4096',
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
      max_memory_restart: '8G',
      // Graceful shutdown
      kill_timeout: 5000,
      // ⚠️ NÃO usar node_args com flags de memória - causa SIGKILL no spawn
    },
    {
      name: 'mvcashnode-executor',
      script: './apps/executor/dist/main.js',
      // Fork mode - executor deve ser único para evitar trades duplicados
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        NODE_OPTIONS: '--max-old-space-size=2048',
      },
      error_file: './logs/executor-error.log',
      out_file: './logs/executor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '4G',
      // Reiniciar diariamente às 3h da manhã para liberar recursos
      cron_restart: '0 3 * * *',
      // Graceful shutdown - mais tempo para finalizar trades em andamento
      kill_timeout: 30000,
      watch: false,
      exp_backoff_restart_delay: 100,
      // ⚠️ NÃO usar node_args - causa SIGKILL no spawn em VMware
    },
    {
      name: 'mvcashnode-monitors',
      script: './apps/monitors/dist/main.js',
      // Cluster mode - iniciar conservador
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        NODE_OPTIONS: '--max-old-space-size=2048',
      },
      error_file: './logs/monitors-error.log',
      out_file: './logs/monitors-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '4G',
      // Reiniciar diariamente às 4h da manhã para liberar recursos
      cron_restart: '0 4 * * *',
      kill_timeout: 30000,
      watch: false,
      exp_backoff_restart_delay: 100,
      // ⚠️ NÃO usar node_args - causa SIGKILL no spawn em VMware
    },
    {
      name: 'mvcashnode-frontend',
      script: 'pnpm',
      args: 'exec next start -p 5010',
      cwd: './apps/frontend',
      version: '2.1.1',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '5010',
        NEXT_PUBLIC_SITE_MODE: 'app',
        NODE_OPTIONS: '--max-old-space-size=2048',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '3G',
      kill_timeout: 5000,
    },
    // Site removido - servido estaticamente pelo nginx
    {
      name: 'mvcashnode-backup',
      script: './apps/backup/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1024',
      },
      error_file: './logs/backup-error.log',
      out_file: './logs/backup-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '2G',
    },
  ],
};
