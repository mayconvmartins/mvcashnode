import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PositionsSyncMissingProcessor } from './processors/positions-sync-missing.processor';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'positions-sync-missing',
    }),
  ],
  providers: [
    PositionsSyncMissingProcessor,
    CronExecutionService,
  ],
})
export class PositionsSyncModule {}

