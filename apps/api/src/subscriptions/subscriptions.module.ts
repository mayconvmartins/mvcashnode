import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { SubscriptionsService } from './subscriptions.service';
import { MercadoPagoService } from './mercadopago.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionPlansController } from './subscription-plans.controller';
import { SubscriberParametersController } from './subscriber-parameters.controller';
import { SubscriptionWebhooksController } from './subscription-webhooks.controller';
import { SubscriptionPaymentsController } from './subscription-payments.controller';

@Module({
  imports: [ConfigModule],
  controllers: [
    SubscriptionsController,
    SubscriptionPlansController,
    SubscriberParametersController,
    SubscriptionWebhooksController,
    SubscriptionPaymentsController,
  ],
  providers: [
    SubscriptionsService,
    MercadoPagoService,
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
  imports: [ConfigModule],
  exports: [SubscriptionsService, MercadoPagoService],
})
export class SubscriptionsModule {}
