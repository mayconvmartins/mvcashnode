import { Module } from '@nestjs/common';
import { InternalNotificationsController } from './internal-notifications.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [InternalNotificationsController],
})
export class InternalModule {}

