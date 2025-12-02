import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TradeExecutionRealProcessor } from './processors/trade-execution-real.processor';
import { TradeExecutionSimProcessor } from './processors/trade-execution-sim.processor';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
  ],
  providers: [
    TradeExecutionRealProcessor,
    TradeExecutionSimProcessor,
    PrismaService,
    {
      provide: EncryptionService,
      useFactory: (configService: ConfigService) => {
        const key = configService.get<string>('ENCRYPTION_KEY');
        if (!key || key.length < 32) {
          throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
        }
        return new EncryptionService(key);
      },
      inject: [ConfigService],
    },
  ],
})
export class TradeExecutionModule {}

