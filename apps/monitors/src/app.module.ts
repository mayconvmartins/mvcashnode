import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SLTPMonitorModule } from './sltp-monitor/sltp-monitor.module';
import { LimitOrdersMonitorModule } from './limit-orders-monitor/limit-orders-monitor.module';
import { BalancesSyncModule } from './balances-sync/balances-sync.module';
import { SystemMonitorModule } from './system-monitor/system-monitor.module';
import { MercadoPagoSyncModule } from './mercadopago-sync/mercadopago-sync.module';
import { TransFiSyncModule } from './transfi-sync/transfi-sync.module';
import { MvmPaySyncModule } from './mvm-pay-sync/mvm-pay-sync.module';
import { PriceSyncModule } from './price-sync/price-sync.module';
import { PositionsSyncModule } from './positions-sync/positions-sync.module';
import { PositionsParamsFixModule } from './positions-params-fix/positions-params-fix.module';
import { DustPositionsMonitorModule } from './dust-positions-monitor/dust-positions-monitor.module';
import { WebhookMonitorModule } from './webhook-monitor/webhook-monitor.module';
import { PositionsSellSyncModule } from './positions-sell-sync/positions-sell-sync.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tentar múltiplos caminhos para encontrar o .env
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '../../../.env'),
        path.resolve(__dirname, '../../../../.env'),
        '.env',
      ],
      // Também carregar variáveis de ambiente do sistema
      ignoreEnvFile: false,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '16379'),
        password: process.env.REDIS_PASSWORD || 'redispassword',
      },
    }),
    SLTPMonitorModule,
    LimitOrdersMonitorModule,
    BalancesSyncModule,
    SystemMonitorModule,
    PriceSyncModule,
    PositionsSyncModule,
    PositionsParamsFixModule,
    DustPositionsMonitorModule,
    MercadoPagoSyncModule,
    TransFiSyncModule,
    MvmPaySyncModule,
    WebhookMonitorModule,
    PositionsSellSyncModule,
  ],
})
export class AppModule {}
