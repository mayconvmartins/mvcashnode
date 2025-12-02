import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NtpService, TimezoneService, MonitorService } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';

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
    ntpService.startPeriodicSync();
    console.log(`[NTP] Serviço iniciado - servidor: ${ntpServer}`);
  }

  console.log(`[Timezone] Configurado: ${timezone}`);

  // Configurar adapters de exchange para usar NTP
  const { BinanceSpotAdapter, BybitSpotAdapter } = await import('@mvcashnode/exchange');
  BinanceSpotAdapter.setNtpService(ntpService);
  BybitSpotAdapter.setNtpService(ntpService);
  console.log('[Exchange] Adapters configurados para usar NTP Service');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  console.log('Monitors service started');
  console.log('Configurando jobs repetitivos...');

  // Inicializar monitoramento do próprio serviço
  const monitorService = new MonitorService();
  const prisma = app.get(PrismaService);

  // Reportar métricas a cada 30 segundos (não precisa de job BullMQ pois já roda aqui)
  setInterval(async () => {
    try {
      const metrics = await monitorService.getCurrentProcessMetrics('MONITORS');
      await prisma.systemMonitoringLog.create({
        data: {
          service_name: metrics.name,
          process_id: metrics.pid,
          status: metrics.status,
          cpu_usage: metrics.cpu,
          memory_usage: metrics.memory / (1024 * 1024), // Converter bytes para MB
          metrics_json: {
            uptime: metrics.uptime,
            memory_bytes: metrics.memory, // Manter valor original em bytes no JSON
          },
        },
      });
    } catch (error) {
      console.error('[Monitors] Erro ao salvar métricas:', error);
    }
  }, 30000);

  // Configurar SL/TP Monitor REAL - executa a cada 30 segundos
  const slTpRealQueue = app.get<Queue>(getQueueToken('sl-tp-monitor-real'));
  await slTpRealQueue.add(
    'monitor-sl-tp',
    {},
    {
      repeat: {
        every: 30000, // 30 segundos
      },
      jobId: 'sl-tp-monitor-real-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ SL/TP Monitor REAL configurado (a cada 30s)');

  // Configurar SL/TP Monitor SIMULATION - executa a cada 30 segundos
  const slTpSimQueue = app.get<Queue>(getQueueToken('sl-tp-monitor-sim'));
  await slTpSimQueue.add(
    'monitor-sl-tp',
    {},
    {
      repeat: {
        every: 30000, // 30 segundos
      },
      jobId: 'sl-tp-monitor-sim-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ SL/TP Monitor SIMULATION configurado (a cada 30s)');

  // Configurar Limit Orders Monitor REAL - executa a cada 60 segundos
  const limitOrdersRealQueue = app.get<Queue>(getQueueToken('limit-orders-monitor-real'));
  await limitOrdersRealQueue.add(
    'monitor-limit-orders',
    {},
    {
      repeat: {
        every: 60000, // 60 segundos (1 minuto)
      },
      jobId: 'limit-orders-monitor-real-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ Limit Orders Monitor REAL configurado (a cada 60s)');

  // Configurar Limit Orders Monitor SIMULATION - executa a cada 60 segundos
  const limitOrdersSimQueue = app.get<Queue>(getQueueToken('limit-orders-monitor-sim'));
  await limitOrdersSimQueue.add(
    'monitor-limit-orders',
    {},
    {
      repeat: {
        every: 60000, // 60 segundos (1 minuto)
      },
      jobId: 'limit-orders-monitor-sim-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ Limit Orders Monitor SIMULATION configurado (a cada 60s)');

  // Configurar Balances Sync REAL - executa a cada 5 minutos
  const balancesSyncQueue = app.get<Queue>(getQueueToken('balances-sync-real'));
  await balancesSyncQueue.add(
    'sync-balances',
    {},
    {
      repeat: {
        every: 300000, // 5 minutos
      },
      jobId: 'balances-sync-real-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ Balances Sync REAL configurado (a cada 5min)');

  // Configurar System Monitor - executa a cada 30 segundos
  const systemMonitorQueue = app.get<Queue>(getQueueToken('system-monitor'));
  await systemMonitorQueue.add(
    'monitor-system',
    {},
    {
      repeat: {
        every: 30000, // 30 segundos
      },
      jobId: 'system-monitor-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ System Monitor configurado (a cada 30s)');

  console.log('🎉 Todos os monitores configurados e rodando!');
}

bootstrap().catch((error) => {
  console.error('Erro ao iniciar monitors service:', error);
  process.exit(1);
});

