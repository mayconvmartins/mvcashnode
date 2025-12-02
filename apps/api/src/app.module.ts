import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // AuthModule,
    // ExchangeAccountsModule,
    // VaultsModule,
    // PositionsModule,
    // WebhooksModule,
    // ReportsModule,
    // AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

