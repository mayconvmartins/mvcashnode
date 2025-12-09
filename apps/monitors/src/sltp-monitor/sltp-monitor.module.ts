import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SLTPMonitorRealProcessor } from './processors/sltp-monitor-real.processor';
import { SLTPMonitorSimProcessor } from './processors/sltp-monitor-sim.processor';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService, CacheService } from '@mvcashnode/shared';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'sl-tp-monitor-real',
    }),
    BullModule.registerQueue({
      name: 'sl-tp-monitor-sim',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
  ],
  providers: [
    SLTPMonitorRealProcessor,
    SLTPMonitorSimProcessor,
    PrismaService,
    CronExecutionService,
    {
      provide: EncryptionService,
      useFactory: (configService: ConfigService) => {
        const key = configService.get<string>('ENCRYPTION_KEY');
        if (!key || key.length < 32) {
          throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
        }
        return new EncryptionService(key);
      },
      inject: [ConfigService],
    },
    {
      provide: CacheService,
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST') || process.env.REDIS_HOST || 'localhost';
        const redisPort = parseInt(configService.get<string>('REDIS_PORT') || process.env.REDIS_PORT || '6379');
        const redisPassword = configService.get<string>('REDIS_PASSWORD') || process.env.REDIS_PASSWORD;
        
        // Log para debug (não logar a senha completa por segurança)
        console.log(`[SLTPMonitorModule] Configurando CacheService: host=${redisHost}, port=${redisPort}, password=${redisPassword ? '***' : 'não definida'}`);
        
        const cacheService = new CacheService(
          redisHost,
          redisPort,
          redisPassword
        );
        // Conectar ao Redis na inicialização
        cacheService.connect().catch((err) => {
          console.error('[SLTPMonitorModule] Erro ao conectar CacheService ao Redis:', err);
        });
        return cacheService;
      },
      inject: [ConfigService],
    },
  ],
})
export class SLTPMonitorModule implements OnModuleInit {
  constructor(private cacheService: CacheService) {}

  async onModuleInit() {
    // Garantir que o CacheService está conectado
    try {
      await this.cacheService.connect();
      console.log('[SLTPMonitorModule] CacheService conectado ao Redis');
    } catch (error) {
      console.error('[SLTPMonitorModule] Erro ao conectar CacheService:', error);
      // Não lançar erro para permitir que o serviço continue funcionando sem cache
    }
  }
}

