import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SystemMonitorProcessor } from './processors/system-monitor.processor';
import { PrismaService } from '@mvcashnode/db';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'system-monitor',
    }),
  ],
  providers: [SystemMonitorProcessor, PrismaService],
})
export class SystemMonitorModule {}

