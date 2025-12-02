import { Module } from '@nestjs/common';
import { TradeJobsController } from './trade-jobs.controller';
import { TradeExecutionsController } from './trade-executions.controller';
import { OperationsController } from './operations.controller';
import { TradeJobsService } from './trade-jobs.service';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  controllers: [TradeJobsController, TradeExecutionsController, OperationsController],
  providers: [TradeJobsService, PrismaService, JwtAuthGuard],
  exports: [TradeJobsService],
})
export class TradeJobsModule {}

