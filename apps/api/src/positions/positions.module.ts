import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PositionsController } from './positions.controller';
import { LimitOrdersController } from './limit-orders.controller';
import { PositionsService } from './positions.service';
import { TradeJobQueueService } from '../trade-jobs/trade-job-queue.service';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
    WebSocketModule,
  ],
  controllers: [PositionsController, LimitOrdersController],
  providers: [
    PositionsService,
    TradeJobQueueService,
    PrismaService,
    JwtAuthGuard,
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
  exports: [PositionsService],
})
export class PositionsModule {}

