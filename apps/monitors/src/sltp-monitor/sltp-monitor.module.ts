import { Module } from '@nestjs/common';
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
        return new CacheService(
          configService.get<string>('REDIS_HOST') || 'localhost',
          parseInt(configService.get<string>('REDIS_PORT') || '6379'),
          configService.get<string>('REDIS_PASSWORD')
        );
      },
      inject: [ConfigService],
    },
  ],
})
export class SLTPMonitorModule {}

