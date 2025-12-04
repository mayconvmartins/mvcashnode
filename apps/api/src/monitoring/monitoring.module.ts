import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { CronManagementController } from './cron-management.controller';
import { CronManagementService } from './cron-management.service';
import { PrismaService } from '@mvcashnode/db';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
    BullModule.registerQueue({
      name: 'sl-tp-monitor-real',
    }),
    BullModule.registerQueue({
      name: 'sl-tp-monitor-sim',
    }),
    BullModule.registerQueue({
      name: 'limit-orders-monitor-real',
    }),
    BullModule.registerQueue({
      name: 'limit-orders-monitor-sim',
    }),
    BullModule.registerQueue({
      name: 'balances-sync-real',
    }),
    BullModule.registerQueue({
      name: 'system-monitor',
    }),
    BullModule.registerQueue({
      name: 'positions-sync-missing',
    }),
    BullModule.registerQueue({
      name: 'price-sync',
    }),
    BullModule.registerQueue({
      name: 'positions-params-fix',
    }),
  ],
  controllers: [MonitoringController, CronManagementController],
  providers: [MonitoringService, CronManagementService, PrismaService],
  exports: [MonitoringService, CronManagementService],
})
export class MonitoringModule {}

