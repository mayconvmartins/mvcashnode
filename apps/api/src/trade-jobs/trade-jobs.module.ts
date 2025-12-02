import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TradeJobsController } from './trade-jobs.controller';
import { TradeExecutionsController } from './trade-executions.controller';
import { OperationsController } from './operations.controller';
import { TradeJobsService } from './trade-jobs.service';
import { TradeJobQueueService } from './trade-job-queue.service';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'trade-execution-real',
    }),
    BullModule.registerQueue({
      name: 'trade-execution-sim',
    }),
  ],
  controllers: [TradeJobsController, TradeExecutionsController, OperationsController],
  providers: [TradeJobsService, TradeJobQueueService, PrismaService, JwtAuthGuard],
  exports: [TradeJobsService, TradeJobQueueService],
})
export class TradeJobsModule {}

