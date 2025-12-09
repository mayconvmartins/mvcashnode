import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PositionsSellSyncProcessor } from './processors/positions-sell-sync.processor';
import { PrismaService } from '@mvcashnode/db';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'positions-sell-sync',
    }),
  ],
  providers: [
    PositionsSellSyncProcessor,
    PrismaService,
    CronExecutionService,
  ],
})
export class PositionsSellSyncModule {}

