import * as cron from 'node-cron';
import { loadConfig, type BackupConfig } from './config';
import { BackupService } from './backup.service';
import { FtpService } from './ftp.service';
import { CleanupService } from './cleanup.service';

// Banner
console.log('==========================================');
console.log('  MVCash Node - Backup Service');
console.log('  MySQL Backup + FTP Upload + Cleanup');
console.log('==========================================');
console.log('');

// Carregar configurações
let config: BackupConfig;
try {
  config = loadConfig();
  console.log('[CONFIG] ✅ Configurações carregadas com sucesso');
  console.log(`[CONFIG] Banco de dados: ${config.database.host}:${config.database.port}/${config.database.database}`);
  console.log(`[CONFIG] Diretório local: ${config.backup.dir}`);
  console.log(`[CONFIG] Retenção: ${config.backup.retentionDays} dias`);
  console.log(`[CONFIG] Schedule: ${config.backup.schedule}`);
  console.log(`[CONFIG] FTP: ${config.ftp.enabled ? `✅ Habilitado (${config.ftp.host})` : '❌ Desabilitado'}`);
  console.log('');
} catch (error: any) {
  console.error('[CONFIG] ❌ Erro ao carregar configurações:', error.message);
  process.exit(1);
}

// Inicializar serviços
const backupService = new BackupService(config);
const ftpService = new FtpService(config);
const cleanupService = new CleanupService(config, ftpService);

/**
 * Função principal que executa o processo completo de backup
 */
async function runBackupProcess(): Promise<void> {
  const startTime = Date.now();
  console.log('');
  console.log('==========================================');
  console.log(`[MAIN] Iniciando processo de backup: ${new Date().toISOString()}`);
  console.log('==========================================');

  try {
    // 1. Executar backup
    const backupFilePath = await backupService.executeBackup();

    // 2. Upload para FTP (se habilitado)
    if (config.ftp.enabled) {
      try {
        await ftpService.uploadFile(backupFilePath);
      } catch (error: any) {
        console.error('[MAIN] ⚠️ Erro no upload FTP, mas backup local foi salvo:', error.message);
        // Continuar mesmo se FTP falhar - backup local está salvo
      }
    }

    // 3. Limpeza de backups antigos
    await cleanupService.cleanup();

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('==========================================');
    console.log(`[MAIN] ✅ Processo de backup concluído com sucesso!`);
    console.log(`[MAIN] Duração total: ${totalDuration}s`);
    console.log('==========================================');
    console.log('');
  } catch (error: any) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error('==========================================');
    console.error(`[MAIN] ❌ Erro durante processo de backup (após ${totalDuration}s):`, error.message);
    console.error('==========================================');
    console.error('');
  }
}

/**
 * Inicialização do serviço
 */
async function initialize(): Promise<void> {
  console.log('[INIT] Inicializando serviço de backup...');

  // Verificar se mysqldump está disponível
  const hasMysqldump = await backupService.checkMysqldump();
  if (!hasMysqldump) {
    console.error('[INIT] ❌ ERRO: mysqldump não encontrado no sistema!');
    console.error('[INIT] Instale o cliente MySQL/MariaDB para continuar.');
    process.exit(1);
  }
  console.log('[INIT] ✅ mysqldump disponível');

  // Testar conexão FTP (se habilitado)
  if (config.ftp.enabled) {
    const ftpOk = await ftpService.testConnection();
    if (!ftpOk) {
      console.warn('[INIT] ⚠️ Não foi possível conectar ao FTP. Upload FTP será desabilitado.');
      config.ftp.enabled = false;
    }
  }

  console.log('[INIT] ✅ Serviço inicializado com sucesso');
  console.log('');

  // Executar backup imediatamente na inicialização
  console.log('[INIT] Executando backup inicial...');
  await runBackupProcess();

  // Agendar backups recorrentes
  console.log(`[SCHEDULER] Agendando backups: ${config.backup.schedule}`);
  cron.schedule(config.backup.schedule, async () => {
    await runBackupProcess();
  });

  console.log('[SCHEDULER] ✅ Scheduler ativo. Aguardando próxima execução...');
  console.log('');
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
  process.exit(1);
});

// Tratamento de sinais de término
process.on('SIGTERM', () => {
  console.log('[SIGNAL] SIGTERM recebido. Encerrando gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SIGNAL] SIGINT recebido. Encerrando gracefully...');
  process.exit(0);
});

// Iniciar o serviço
initialize().catch((error) => {
  console.error('[INIT] ❌ Erro fatal durante inicialização:', error);
  process.exit(1);
});

