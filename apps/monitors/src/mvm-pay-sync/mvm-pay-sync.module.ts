import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { MvmPaySyncProcessor } from './processors/mvm-pay-sync.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'mvm-pay-sync',
    }),
  ],
  providers: [
    MvmPaySyncProcessor,
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
export class MvmPaySyncModule {}

