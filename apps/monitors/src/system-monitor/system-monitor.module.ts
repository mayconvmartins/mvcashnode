import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SystemMonitorProcessor } from './processors/system-monitor.processor';
import { PrismaService } from '@mvcashnode/db';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'system-monitor',
    }),
  ],
  providers: [SystemMonitorProcessor, PrismaService, CronExecutionService],
})
export class SystemMonitorModule {}

