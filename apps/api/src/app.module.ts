import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ExchangeAccountsModule } from './exchange-accounts/exchange-accounts.module';
import { VaultsModule } from './vaults/vaults.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PositionsModule } from './positions/positions.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { TradeParametersModule } from './trade-parameters/trade-parameters.module';
import { TradeJobsModule } from './trade-jobs/trade-jobs.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InternalModule } from './internal/internal.module';
import { WebSocketModule } from './websocket/websocket.module';
import { CommonModule } from './common/common.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { CryptoLogosModule } from './crypto-logos/crypto-logos.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(process.cwd(), '.env'),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: 60000, // 1 minuto
          limit: parseInt(configService.get<string>('RATE_LIMIT_REQUESTS') || '100'), // 100 requisições por minuto por padrão
        },
      ],
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST') || 'localhost';
        const redisPort = parseInt(configService.get<string>('REDIS_PORT') || '6379');
        const redisPassword = configService.get<string>('REDIS_PASSWORD');
        
        console.log(`[BullMQ] Configurando conexão Redis: ${redisHost}:${redisPort} (password: ${redisPassword ? '***' : 'não configurado'})`);
        
        return {
          connection: {
            host: redisHost,
            port: redisPort,
            password: redisPassword || undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    ExchangeAccountsModule,
    VaultsModule,
    WebhooksModule,
    PositionsModule,
    ReportsModule,
    AdminModule,
    TradeParametersModule,
    TradeJobsModule,
    MonitoringModule,
    NotificationsModule,
    InternalModule,
    WebSocketModule,
    CommonModule,
    SubscriptionsModule,
    CryptoLogosModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

