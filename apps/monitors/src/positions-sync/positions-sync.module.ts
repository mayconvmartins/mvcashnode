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
      // ✅ OTIMIZAÇÃO CPU: Concurrency 2 permite processar múltiplos jobs em paralelo
    }),
    BullModule.registerQueue({
      name: 'positions-sync-duplicates',
      // ✅ OTIMIZAÇÃO CPU: Concurrency 2 permite processar múltiplos jobs em paralelo
    }),
    BullModule.registerQueue({
      name: 'positions-sync-quantity',
      // ✅ OTIMIZAÇÃO CPU: Concurrency 2 permite processar múltiplos jobs em paralelo
    }),
    BullModule.registerQueue({
      name: 'positions-sync-fees',
      // ✅ OTIMIZAÇÃO CPU: Concurrency 2 permite processar múltiplos jobs em paralelo
    }),
    BullModule.registerQueue({
      name: 'positions-sync-exchange',
      // ✅ OTIMIZAÇÃO CPU: Concurrency 2 permite processar múltiplos jobs em paralelo
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

