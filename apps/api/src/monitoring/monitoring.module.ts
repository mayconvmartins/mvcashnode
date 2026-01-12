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
    BullModule.registerQueue({
      name: 'dust-positions-monitor',
    }),
    BullModule.registerQueue({
      name: 'webhook-monitor',
    }),
    BullModule.registerQueue({
      name: 'positions-sell-sync',
    }),
    BullModule.registerQueue({
      name: 'positions-sync-duplicates',
    }),
    BullModule.registerQueue({
      name: 'positions-sync-quantity',
    }),
    BullModule.registerQueue({
      name: 'positions-sync-fees',
    }),
    BullModule.registerQueue({
      name: 'positions-sync-exchange',
    }),
    BullModule.registerQueue({
      name: 'mvm-pay-sync',
    }),
  ],
  controllers: [MonitoringController, CronManagementController],
  providers: [MonitoringService, CronManagementService, PrismaService],
  exports: [MonitoringService, CronManagementService],
})
export class MonitoringModule {}

