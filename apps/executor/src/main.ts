import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
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
  console.log('Executor service started');

  // Inicializar monitoramento
  const monitorService = new MonitorService();
  const prisma = app.get(PrismaService);

  // Reportar métricas a cada 30 segundos
  setInterval(async () => {
    try {
      const metrics = await monitorService.getCurrentProcessMetrics('EXECUTOR');
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
      console.error('[Executor] Erro ao salvar métricas:', error);
    }
  }, 30000);
}

bootstrap();

