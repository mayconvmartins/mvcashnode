import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { LimitOrdersController } from './limit-orders.controller';
import { PositionsService } from './positions.service';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  controllers: [PositionsController, LimitOrdersController],
  providers: [PositionsService, PrismaService, JwtAuthGuard],
  exports: [PositionsService],
})
export class PositionsModule {}

