import { Module } from '@nestjs/common';
import { TradeParametersController } from './trade-parameters.controller';
import { TradeParametersService } from './trade-parameters.service';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  controllers: [TradeParametersController],
  providers: [TradeParametersService, PrismaService, JwtAuthGuard],
  exports: [TradeParametersService],
})
export class TradeParametersModule {}

