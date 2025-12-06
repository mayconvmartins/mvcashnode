import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DustPositionsMonitorProcessor } from './processors/dust-positions-monitor.processor';
import { PrismaService } from '@mvcashnode/db';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'dust-positions-monitor',
    }),
  ],
  providers: [
    DustPositionsMonitorProcessor,
    PrismaService,
    CronExecutionService,
  ],
})
export class DustPositionsMonitorModule {}
