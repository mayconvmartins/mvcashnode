import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { WebSocketService, WebSocketEvent } from './websocket.service';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class WebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(
    private readonly wsService: WebSocketService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  afterInit(server: Server) {
    this.wsService.setServer(server);
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: WebSocket, ...args: any[]) {
    try {
      // Extrair token da query string
      const request = args[0] as any;
      const url = new URL(request.url, 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        this.logger.warn('WebSocket connection rejected: no token provided');
        client.close(1008, 'Authentication required');
        return;
      }

      // Verificar e decodificar token JWT
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      if (!jwtSecret) {
        this.logger.error('JWT_SECRET not configured');
        client.close(1011, 'Server configuration error');
        return;
      }

      let payload: any;
      try {
        payload = jwt.verify(token, jwtSecret);
      } catch (error) {
        this.logger.warn('WebSocket connection rejected: invalid token');
        client.close(1008, 'Invalid token');
        return;
      }

      // Verificar se o usuário existe e está ativo
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || !user.is_active) {
        this.logger.warn(`WebSocket connection rejected: user ${payload.userId} not found or inactive`);
        client.close(1008, 'User not found or inactive');
        return;
      }

      // Adicionar cliente autenticado
      this.wsService.addClient(client, user.id, user.email);
      this.logger.log(`WebSocket client connected: userId=${user.id}, email=${user.email}`);

      // Enviar mensagem de boas-vindas
      client.send(
        JSON.stringify({
          type: 'connected',
          message: 'WebSocket connected successfully',
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      this.logger.error('Error handling WebSocket connection:', error);
      client.close(1011, 'Internal server error');
    }
  }

  handleDisconnect(client: WebSocket) {
    this.wsService.removeClient(client);
    this.logger.log('WebSocket client disconnected');
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: WebSocket) {
    client.send(
      JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString(),
      })
    );
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { events: WebSocketEvent[] }
  ) {
    if (data && Array.isArray(data.events)) {
      this.wsService.subscribeToEvents(client, data.events);
      client.send(
        JSON.stringify({
          type: 'subscribed',
          events: data.events,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { events: WebSocketEvent[] }
  ) {
    if (data && Array.isArray(data.events)) {
      this.wsService.unsubscribeFromEvents(client, data.events);
      client.send(
        JSON.stringify({
          type: 'unsubscribed',
          events: data.events,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
}

