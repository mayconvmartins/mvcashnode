import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PositionsSyncMissingProcessor } from './processors/positions-sync-missing.processor';
import { PositionsSyncDuplicatesProcessor } from './processors/positions-sync-duplicates.processor';
import { PositionsSyncQuantityProcessor } from './processors/positions-sync-quantity.processor';
import { PositionsSyncFeesProcessor } from './processors/positions-sync-fees.processor';
import { PositionsSyncExchangeProcessor } from './processors/positions-sync-exchange.processor';
import { PrismaService } from '@mvcashnode/db';
import { CronExecutionService } from '../shared/cron-execution.service';
import { CacheService } from '@mvcashnode/shared';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'positions-sync-missing',
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
  ],
  providers: [
    PositionsSyncMissingProcessor,
    PositionsSyncDuplicatesProcessor,
    PositionsSyncQuantityProcessor,
    PositionsSyncFeesProcessor,
    PositionsSyncExchangeProcessor,
    PrismaService,
    CronExecutionService,
    CacheService,
  ],
})
export class PositionsSyncModule {}

