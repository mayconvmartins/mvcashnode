import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { PrismaService } from '@mvcashnode/db';

@Module({
  imports: [ConfigModule],
  providers: [WebSocketGateway, WebSocketService, PrismaService],
  exports: [WebSocketService],
})
export class WebSocketModule {}

