import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaService } from '@mvcashnode/db';
import { CacheService } from '@mvcashnode/shared';
import { WebhookMonitorProcessor } from './processors/webhook-monitor.processor';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
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
    CacheService,
    CronExecutionService,
    WebhookMonitorProcessor,
  ],
})
export class WebhookMonitorModule {}

