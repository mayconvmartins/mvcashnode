import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookSourcesController } from './webhook-sources.controller';
import { WebhookBindingsController } from './webhook-bindings.controller';
import { WebhookEventsController } from './webhook-events.controller';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradeJobQueueService } from '../trade-jobs/trade-job-queue.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
    NotificationsModule,
    WebSocketModule,
  ],
  controllers: [
    WebhookSourcesController,
    WebhookBindingsController,
    WebhookEventsController,
    WebhooksController,
  ],
  providers: [
    WebhooksService,
    TradeJobQueueService,
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
  exports: [WebhooksService],
})
export class WebhooksModule {}

