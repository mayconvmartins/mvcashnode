import { Module } from '@nestjs/common';
import { WebhookSourcesController } from './webhook-sources.controller';
import { WebhookBindingsController } from './webhook-bindings.controller';
import { WebhookEventsController } from './webhook-events.controller';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  controllers: [
    WebhookSourcesController,
    WebhookBindingsController,
    WebhookEventsController,
    WebhooksController,
  ],
  providers: [
    WebhooksService,
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
    JwtAuthGuard,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}

