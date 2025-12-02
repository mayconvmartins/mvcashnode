import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LimitOrdersMonitorRealProcessor } from './processors/limit-orders-monitor-real.processor';
import { LimitOrdersMonitorSimProcessor } from './processors/limit-orders-monitor-sim.processor';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'limit-orders-monitor-real',
    }),
    BullModule.registerQueue({
      name: 'limit-orders-monitor-sim',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
  ],
  providers: [
    LimitOrdersMonitorRealProcessor,
    LimitOrdersMonitorSimProcessor,
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
  ],
})
export class LimitOrdersMonitorModule {}

