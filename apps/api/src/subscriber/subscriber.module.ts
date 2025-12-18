import { Module } from '@nestjs/common';
import { SubscriberController } from './subscriber.controller';
import { PrismaService } from '@mvcashnode/db';

@Module({
  imports: [],
  controllers: [SubscriberController],
  providers: [PrismaService],
  exports: [],
})
export class SubscriberModule {}

