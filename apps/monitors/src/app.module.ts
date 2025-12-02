import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// Import monitor modules here

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // SLTPMonitorModule,
    // LimitOrdersMonitorModule,
    // BalancesSyncModule,
  ],
})
export class AppModule {}

