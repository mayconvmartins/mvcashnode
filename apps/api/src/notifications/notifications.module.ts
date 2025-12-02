import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationWrapperService } from './notification-wrapper.service';
import { PrismaService } from '@mvcashnode/db';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWrapperService, PrismaService],
  exports: [NotificationsService, NotificationWrapperService],
})
export class NotificationsModule {}

