import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BalancesSyncProcessor } from './processors/balances-sync.processor';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'balances-sync-real',
    }),
  ],
  providers: [
    BalancesSyncProcessor,
    PrismaService,
    CronExecutionService,
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
export class BalancesSyncModule {}

