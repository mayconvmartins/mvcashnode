import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaService } from '@mvcashnode/db';
import { CacheService } from '@mvcashnode/shared';
import { WebhookMonitorProcessor } from './processors/webhook-monitor.processor';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'webhook-monitor',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
  ],
  providers: [
    PrismaService,
    {
      provide: CacheService,
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST') || process.env.REDIS_HOST || 'localhost';
        const redisPort = parseInt(configService.get<string>('REDIS_PORT') || process.env.REDIS_PORT || '6379');
        const redisPassword = configService.get<string>('REDIS_PASSWORD') || process.env.REDIS_PASSWORD;
        
        // Log para debug (não logar a senha completa por segurança)
        console.log(`[WebhookMonitorModule] Configurando CacheService: host=${redisHost}, port=${redisPort}, password=${redisPassword ? '***' : 'não definida'}`);
        
        const cacheService = new CacheService(
          redisHost,
          redisPort,
          redisPassword
        );
        // Conectar ao Redis na inicialização
        cacheService.connect().catch((err) => {
          console.error('[WebhookMonitorModule] Erro ao conectar CacheService ao Redis:', err);
        });
        return cacheService;
      },
      inject: [ConfigService],
    },
    CronExecutionService,
    WebhookMonitorProcessor,
  ],
})
export class WebhookMonitorModule {}

