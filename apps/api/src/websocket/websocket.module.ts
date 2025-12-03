import { Module } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { PrismaService } from '@mvcashnode/db';

@Module({
  providers: [WebSocketGateway, WebSocketService, PrismaService],
  exports: [WebSocketService],
})
export class WebSocketModule {}

