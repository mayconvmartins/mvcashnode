import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// Import executor modules here

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // TradeExecutionModule,
  ],
})
export class AppModule {}

