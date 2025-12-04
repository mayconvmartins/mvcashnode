import { Module } from '@nestjs/common';
import { InternalNotificationsController } from './internal-notifications.controller';
import { InternalPositionsController } from './internal-positions.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '@mvcashnode/db';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [NotificationsModule, ConfigModule],
  controllers: [InternalNotificationsController, InternalPositionsController],
  providers: [PrismaService],
})
export class InternalModule {}

