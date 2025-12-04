import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PriceSyncProcessor } from './processors/price-sync.processor';
import { PrismaService } from '@mvcashnode/db';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'price-sync',
    }),
  ],
  providers: [
    PriceSyncProcessor,
    PrismaService,
    CronExecutionService,
  ],
})
export class PriceSyncModule {}

