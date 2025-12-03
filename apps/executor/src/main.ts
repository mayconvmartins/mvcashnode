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

  // Função para reportar métricas
  const reportMetrics = async () => {
    try {
      const startTime = Date.now();
      const metrics = await monitorService.getCurrentProcessMetrics('EXECUTOR');
      
      if (!metrics) {
        console.warn('[Executor] Métricas não disponíveis');
        return;
      }

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

      const duration = Date.now() - startTime;
      console.log(`[Executor] Métricas salvas com sucesso (PID: ${metrics.pid}, CPU: ${metrics.cpu.toFixed(2)}%, Mem: ${(metrics.memory / (1024 * 1024)).toFixed(2)}MB) - ${duration}ms`);
    } catch (error) {
      console.error('[Executor] Erro ao salvar métricas:', error);
      if (error instanceof Error) {
        console.error('[Executor] Erro detalhado:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
      }
      // Não relançar o erro para não interromper o processo
    }
  };

  // Reportar métricas imediatamente ao iniciar
  console.log('[Executor] Iniciando monitoramento de métricas...');
  await reportMetrics().catch((error) => {
    console.error('[Executor] Erro ao reportar métricas iniciais:', error);
  });

  // Reportar métricas a cada 30 segundos
  const metricsInterval = setInterval(reportMetrics, 30000);
  console.log('[Executor] Monitoramento de métricas configurado (intervalo: 30s)');

  // Garantir que o intervalo seja limpo ao encerrar o processo
  process.on('SIGTERM', () => {
    console.log('[Executor] Encerrando monitoramento...');
    clearInterval(metricsInterval);
  });

  process.on('SIGINT', () => {
    console.log('[Executor] Encerrando monitoramento...');
    clearInterval(metricsInterval);
  });
}

bootstrap();

