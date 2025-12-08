import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminSystemController } from './admin-system.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminSubscribersController, AdminSubscriberParametersController } from './admin-subscribers.controller';
import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import { AdminMercadoPagoController } from './admin-mercadopago.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TradeJobQueueService } from '../trade-jobs/trade-job-queue.service';
import { BullModule } from '@nestjs/bullmq';
import { MercadoPagoService } from '../subscriptions/mercadopago.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'trade-execution-real' },
      { name: 'trade-execution-sim' }
    ),
  ],
  controllers: [
    AdminUsersController,
    AdminSystemController,
    AdminAuditController,
    AdminNotificationsController,
    AdminSubscriptionsController,
    AdminSubscribersController,
    AdminSubscriberParametersController,
    AdminSubscriptionPlansController,
    AdminMercadoPagoController,
  ],
  providers: [
    AdminService,
    PrismaService,
    TradeJobQueueService,
    MercadoPagoService,
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
    RolesGuard,
  ],
  exports: [AdminService],
})
export class AdminModule {}

