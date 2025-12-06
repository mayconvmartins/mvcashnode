import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SLTPMonitorModule } from './sltp-monitor/sltp-monitor.module';
import { LimitOrdersMonitorModule } from './limit-orders-monitor/limit-orders-monitor.module';
import { BalancesSyncModule } from './balances-sync/balances-sync.module';
import { SystemMonitorModule } from './system-monitor/system-monitor.module';
import { PriceSyncModule } from './price-sync/price-sync.module';
import { PositionsSyncModule } from './positions-sync/positions-sync.module';
import { PositionsParamsFixModule } from './positions-params-fix/positions-params-fix.module';
import { DustPositionsMonitorModule } from './dust-positions-monitor/dust-positions-monitor.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../../../.env'),
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
  ],
})
export class AppModule {}
