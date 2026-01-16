import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NtpService, TimezoneService } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';

// Mapeamento de nome do job para nome da queue
interface JobConfig {
  name: string; // Nome do job na tabela cron_job_configs
  queueName: string; // Nome da queue BullMQ
  bullJobName: string; // Nome do job dentro da queue
  jobId: string; // ID do job repetitivo
  defaultInterval: number; // Intervalo padrão em ms
  description: string; // Descrição para log
}

const JOB_CONFIGS: JobConfig[] = [
  { name: 'sl-tp-monitor-real', queueName: 'sl-tp-monitor-real', bullJobName: 'monitor-sl-tp', jobId: 'sl-tp-monitor-real-repeat', defaultInterval: 30000, description: 'SL/TP Monitor REAL (a cada 30s)' },
  { name: 'sl-tp-monitor-sim', queueName: 'sl-tp-monitor-sim', bullJobName: 'monitor-sl-tp', jobId: 'sl-tp-monitor-sim-repeat', defaultInterval: 30000, description: 'SL/TP Monitor SIMULATION (a cada 30s)' },
  { name: 'limit-orders-monitor-real', queueName: 'limit-orders-monitor-real', bullJobName: 'monitor-limit-orders', jobId: 'limit-orders-monitor-real-repeat', defaultInterval: 60000, description: 'Limit Orders Monitor REAL (a cada 60s)' },
  { name: 'limit-orders-monitor-sim', queueName: 'limit-orders-monitor-sim', bullJobName: 'monitor-limit-orders', jobId: 'limit-orders-monitor-sim-repeat', defaultInterval: 60000, description: 'Limit Orders Monitor SIMULATION (a cada 60s)' },
  { name: 'balances-sync-real', queueName: 'balances-sync-real', bullJobName: 'sync-balances', jobId: 'balances-sync-real-repeat', defaultInterval: 300000, description: 'Balances Sync REAL (a cada 5min)' },
  { name: 'system-monitor', queueName: 'system-monitor', bullJobName: 'monitor-system', jobId: 'system-monitor-repeat', defaultInterval: 30000, description: 'System Monitor (a cada 30s)' },
  { name: 'webhook-monitor', queueName: 'webhook-monitor', bullJobName: 'monitor-webhook-alerts', jobId: 'webhook-monitor-repeat', defaultInterval: 30000, description: 'Webhook Monitor (a cada 30s)' },
  { name: 'price-sync', queueName: 'price-sync', bullJobName: 'sync-prices', jobId: 'price-sync-repeat', defaultInterval: 22000, description: 'Price Sync (a cada 22s, TTL cache: 25s)' },
  { name: 'positions-sync-missing', queueName: 'positions-sync-missing', bullJobName: 'sync-missing-positions', jobId: 'positions-sync-missing-repeat', defaultInterval: 300000, description: 'Positions Sync Missing (a cada 5min)' },
  { name: 'positions-sync-duplicates', queueName: 'positions-sync-duplicates', bullJobName: 'sync-duplicates', jobId: 'positions-sync-duplicates-repeat', defaultInterval: 300000, description: 'Positions Sync Duplicates (a cada 5min)' },
  { name: 'positions-sync-quantity', queueName: 'positions-sync-quantity', bullJobName: 'sync-quantity', jobId: 'positions-sync-quantity-repeat', defaultInterval: 600000, description: 'Positions Sync Quantity (a cada 10min)' },
  { name: 'positions-sync-fees', queueName: 'positions-sync-fees', bullJobName: 'sync-fees', jobId: 'positions-sync-fees-repeat', defaultInterval: 1800000, description: 'Positions Sync Fees (a cada 30min)' },
  { name: 'positions-sync-exchange', queueName: 'positions-sync-exchange', bullJobName: 'sync-exchange', jobId: 'positions-sync-exchange-repeat', defaultInterval: 600000, description: 'Positions Sync Exchange (a cada 10min)' },
  { name: 'positions-params-fix', queueName: 'positions-params-fix', bullJobName: 'fix-positions-params', jobId: 'positions-params-fix-repeat', defaultInterval: 60000, description: 'Positions Params Fix (a cada 1min)' },
  { name: 'positions-sell-sync', queueName: 'positions-sell-sync', bullJobName: 'sync-positions-sell', jobId: 'positions-sell-sync-repeat', defaultInterval: 300000, description: 'Positions Sell Sync (a cada 5min)' },
  { name: 'dust-positions-monitor', queueName: 'dust-positions-monitor', bullJobName: 'monitor-dust-positions', jobId: 'dust-positions-monitor-repeat', defaultInterval: 300000, description: 'Dust Positions Monitor (a cada 5min)' },
  { name: 'mercadopago-sync', queueName: 'mercadopago-sync', bullJobName: 'sync-mercadopago-payments', jobId: 'mercadopago-sync-repeat', defaultInterval: 600000, description: 'Mercado Pago Sync (a cada 10min)' },
];

async function bootstrap() {
  // Inicializar serviços de tempo
  const ntpEnabled = process.env.NTP_ENABLED === 'true';
  const ntpServer = process.env.NTP_SERVER || 'pool.ntp.org';
  const ntpSyncInterval = parseInt(process.env.NTP_SYNC_INTERVAL || '3600000');
  const timezone = process.env.TIMEZONE || 'America/Sao_Paulo'; // Timezone padrão: São Paulo

  const ntpService = new NtpService(ntpServer, ntpSyncInterval, ntpEnabled);
  // @ts-ignore - Timezone service para uso futuro
  new TimezoneService(timezone);

  if (ntpEnabled) {
    // Sincronizar IMEDIATAMENTE antes de configurar adapters
    console.log(`[NTP] Sincronizando com ${ntpServer}...`);
    await ntpService.sync();
    const ntpInfo = ntpService.getInfo();
    console.log(`[NTP] Offset atual: ${ntpInfo.offset}ms`);
    
    // Iniciar sincronização periódica
    ntpService.startPeriodicSync();
    console.log(`[NTP] Serviço iniciado - servidor: ${ntpServer}, intervalo: ${ntpSyncInterval}ms`);
  } else {
    console.warn('[NTP] ⚠️ NTP desabilitado - timestamps podem estar incorretos!');
  }

  console.log(`[Timezone] Configurado: ${timezone}`);

  // Configurar AdapterFactory com o NtpService ANTES de criar qualquer adapter
  const { AdapterFactory } = await import('@mvcashnode/exchange');
  AdapterFactory.setNtpService(ntpService);
  console.log('[Exchange] ✅ AdapterFactory configurado para usar NTP Service');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  console.log('Monitors service started');
  console.log('Configurando jobs repetitivos...');

  // ✅ OTIMIZAÇÃO CPU: Métricas são coletadas pelo System Monitor a cada 30s
  // Removido setInterval duplicado para economizar ~120 queries/hora

  // ✅ Cleanup em shutdown
  const shutdown = async () => {
    console.log('[Monitors] Encerrando serviço...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // ✅ CORREÇÃO CRÍTICA: Buscar configurações do banco antes de adicionar jobs
  const prisma = app.get(PrismaService);
  
  // Buscar todas as configurações de cron jobs do banco
  const dbConfigs = await prisma.cronJobConfig.findMany({
    select: {
      name: true,
      enabled: true,
      status: true,
      interval_ms: true,
    },
  });
  
  // Criar um mapa para lookup rápido
  const configMap = new Map(dbConfigs.map(c => [c.name, c]));
  
  console.log(`[Monitors] Encontradas ${dbConfigs.length} configurações no banco de dados`);

  let enabledCount = 0;
  let disabledCount = 0;

  // Iterar sobre cada job e verificar se está habilitado
  for (const jobConfig of JOB_CONFIGS) {
    const dbConfig = configMap.get(jobConfig.name);
    
    // Verificar se o job está enabled=true E status='ACTIVE'
    const isEnabled = dbConfig?.enabled === true && dbConfig?.status === 'ACTIVE';
    const interval = dbConfig?.interval_ms || jobConfig.defaultInterval;
    
    if (!isEnabled) {
      // Job desabilitado - NÃO adicionar ao BullMQ
      const reason = !dbConfig 
        ? 'não encontrado no banco' 
        : !dbConfig.enabled 
          ? 'enabled=false' 
          : `status=${dbConfig.status}`;
      console.log(`⏸️ ${jobConfig.description} - DESABILITADO (${reason})`);
      disabledCount++;
      continue;
    }
    
    // Job habilitado - adicionar ao BullMQ
    try {
      const queue = app.get<Queue>(getQueueToken(jobConfig.queueName));
      
      // Remover job repetitivo existente para evitar duplicatas
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const rj of repeatableJobs) {
        if (rj.id === jobConfig.jobId || rj.key?.includes(jobConfig.jobId)) {
          await queue.removeRepeatableByKey(rj.key);
        }
      }
      
      // Adicionar novo job repetitivo
      await queue.add(
        jobConfig.bullJobName,
        {},
        {
          repeat: { every: interval },
          jobId: jobConfig.jobId,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
      console.log(`✅ ${jobConfig.description}`);
      enabledCount++;
    } catch (err: any) {
      console.error(`❌ Erro ao configurar ${jobConfig.name}: ${err.message}`);
    }
  }

  console.log(`\n📊 Resumo: ${enabledCount} jobs habilitados, ${disabledCount} jobs desabilitados`);
  console.log('🎉 Monitores configurados e rodando!');
}

bootstrap().catch((error) => {
  console.error('Erro ao iniciar monitors service:', error);
  process.exit(1);
});

