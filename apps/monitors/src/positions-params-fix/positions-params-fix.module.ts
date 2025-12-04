import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PositionsParamsFixProcessor } from './processors/positions-params-fix.processor';
import { PrismaService } from '@mvcashnode/db';
import { CronExecutionService } from '../shared/cron-execution.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'positions-params-fix',
    }),
  ],
  providers: [
    PositionsParamsFixProcessor,
    PrismaService,
    CronExecutionService,
  ],
})
export class PositionsParamsFixModule {}

