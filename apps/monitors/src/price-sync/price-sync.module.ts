import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PriceSyncProcessor } from './processors/price-sync.processor';
import { PrismaService } from '@mvcashnode/db';
import { CacheService } from '@mvcashnode/shared';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'price-sync',
    }),
  ],
  providers: [
    PriceSyncProcessor,
    PrismaService,
    {
      provide: CacheService,
      useFactory: (configService: ConfigService) => {
        return new CacheService(
          configService.get<string>('REDIS_HOST') || 'localhost',
          parseInt(configService.get<string>('REDIS_PORT') || '6379'),
          configService.get<string>('REDIS_PASSWORD')
        );
      },
      inject: [ConfigService],
    },
    CronExecutionService,
  ],
})
export class PriceSyncModule {}

