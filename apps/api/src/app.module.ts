import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
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
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(process.cwd(), '.env'),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

