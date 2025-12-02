import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SLTPMonitorRealProcessor } from './processors/sltp-monitor-real.processor';
import { SLTPMonitorSimProcessor } from './processors/sltp-monitor-sim.processor';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'sl-tp-monitor-real',
    }),
    BullModule.registerQueue({
      name: 'sl-tp-monitor-sim',
    }),
  ],
  providers: [
    SLTPMonitorRealProcessor,
    SLTPMonitorSimProcessor,
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
export class SLTPMonitorModule {}

