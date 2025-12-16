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
      // ✅ OTIMIZAÇÃO CPU: Configurar para remover jobs após falha e completar
      // Previne acúmulo de jobs órfãos no Redis
      defaultJobOptions: {
        attempts: 1, // Não retry automático
        removeOnComplete: true, // Remove após completar
        removeOnFail: { age: 3600 }, // Remove após 1h se falhar
      },
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { age: 3600 },
      },
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

