import { Module } from '@nestjs/common';
import { SubscriberController } from './subscriber.controller';
import { PrismaService } from '@mvcashnode/db';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [ReportsModule],
  controllers: [SubscriberController],
  providers: [PrismaService],
  exports: [],
})
export class SubscriberModule {}

