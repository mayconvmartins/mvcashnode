import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(process.cwd(), '.env'),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

