import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { SubscriptionsService } from './subscriptions.service';
import { MercadoPagoService } from './mercadopago.service';
import { TransFiService } from './transfi.service';
import { MvmPayService } from './mvm-pay.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionPaymentsController } from './subscription-payments.controller';
import { SubscriptionGuard } from './guards/subscription.guard';
import { BlockSubscribersGuard } from './guards/block-subscribers.guard';

@Module({
  imports: [ConfigModule],
  controllers: [
    SubscriptionsController,
    SubscriptionPaymentsController,
  ],
  providers: [
    SubscriptionsService,
    MercadoPagoService,
    TransFiService,
    MvmPayService,
    PrismaService,
    SubscriptionGuard,
    BlockSubscribersGuard,
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
  exports: [
    SubscriptionsService,
    MercadoPagoService,
    TransFiService,
    MvmPayService,
    SubscriptionGuard,
    BlockSubscribersGuard,
  ],
})
export class SubscriptionsModule {}
