import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SLTPMonitorModule } from './sltp-monitor/sltp-monitor.module';
import { LimitOrdersMonitorModule } from './limit-orders-monitor/limit-orders-monitor.module';
import { BalancesSyncModule } from './balances-sync/balances-sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    SLTPMonitorModule,
    LimitOrdersMonitorModule,
    BalancesSyncModule,
  ],
})
export class AppModule {}
