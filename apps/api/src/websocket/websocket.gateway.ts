import {
  WebSocketGateway as WSGateway,
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

@WSGateway({
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
    let requestUrl: string | null = null;
    let token: string | null = null;

    try {
      this.logger.debug(`[WebSocket] Nova tentativa de conexão. Args recebidos: ${args.length}`);

      // Extrair URL do request - WsAdapter pode passar de diferentes formas
      const request = args[0] as any;
      
      if (!request) {
        this.logger.error('[WebSocket] Request não encontrado nos args');
        client.close(1008, 'Invalid connection request');
        return;
      }

      // Tentar diferentes formatos de extração da URL
      if (request.url) {
        requestUrl = request.url;
      } else if (request.headers && request.headers.url) {
        requestUrl = request.headers.url;
      } else if (typeof request === 'string') {
        requestUrl = request;
      } else if (request._req && request._req.url) {
        requestUrl = request._req.url;
      }

      if (!requestUrl) {
        this.logger.error('[WebSocket] Não foi possível extrair URL do request', {
          requestKeys: request ? Object.keys(request) : [],
          argsLength: args.length,
        });
        client.close(1008, 'Invalid connection request');
        return;
      }

      this.logger.debug(`[WebSocket] URL extraída: ${requestUrl}`);

      // Log dos headers se disponíveis
      if (request.headers) {
        this.logger.debug(`[WebSocket] Headers recebidos:`, {
          origin: request.headers.origin,
          'user-agent': request.headers['user-agent'],
          'sec-websocket-protocol': request.headers['sec-websocket-protocol'],
        });
      }

      // Extrair token da query string
      let url: URL;
      try {
        // Tentar criar URL com base absoluta ou relativa
        if (requestUrl.startsWith('http://') || requestUrl.startsWith('https://') || requestUrl.startsWith('ws://') || requestUrl.startsWith('wss://')) {
          url = new URL(requestUrl);
        } else {
          // URL relativa, usar base localhost
          url = new URL(requestUrl, 'http://localhost');
        }
      } catch (urlError) {
        this.logger.error(`[WebSocket] Erro ao parsear URL: ${requestUrl}`, urlError);
        client.close(1008, 'Invalid URL format');
        return;
      }

      token = url.searchParams.get('token');
      this.logger.debug(`[WebSocket] Token extraído: ${token ? 'presente' : 'ausente'}`);

      if (!token) {
        this.logger.warn('[WebSocket] Conexão rejeitada: token não fornecido');
        client.close(1008, 'Authentication required');
        return;
      }

      // Verificar e decodificar token JWT
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      if (!jwtSecret) {
        this.logger.error('[WebSocket] JWT_SECRET não configurado');
        client.close(1011, 'Server configuration error');
        return;
      }

      this.logger.debug('[WebSocket] Verificando token JWT...');
      let payload: any;
      try {
        payload = jwt.verify(token, jwtSecret);
        this.logger.debug(`[WebSocket] Token válido para userId: ${payload.userId}`);
      } catch (error) {
        this.logger.warn('[WebSocket] Conexão rejeitada: token inválido', error);
        client.close(1008, 'Invalid token');
        return;
      }

      // Verificar se o usuário existe e está ativo
      this.logger.debug(`[WebSocket] Verificando usuário no banco: userId=${payload.userId}`);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        this.logger.warn(`[WebSocket] Conexão rejeitada: usuário ${payload.userId} não encontrado`);
        client.close(1008, 'User not found');
        return;
      }

      if (!user.is_active) {
        this.logger.warn(`[WebSocket] Conexão rejeitada: usuário ${payload.userId} inativo`);
        client.close(1008, 'User inactive');
        return;
      }

      // Adicionar cliente autenticado
      this.wsService.addClient(client, user.id, user.email);
      this.logger.log(`[WebSocket] ✅ Cliente conectado: userId=${user.id}, email=${user.email}`);

      // Enviar mensagem de boas-vindas
      const welcomeMessage = {
        type: 'connected',
        message: 'WebSocket connected successfully',
        timestamp: new Date().toISOString(),
      };
      
      client.send(JSON.stringify(welcomeMessage));
      this.logger.debug('[WebSocket] Mensagem de boas-vindas enviada');
    } catch (error) {
      this.logger.error('[WebSocket] Erro ao processar conexão:', error);
      this.logger.error('[WebSocket] Stack trace:', error instanceof Error ? error.stack : 'N/A');
      try {
        client.close(1011, 'Internal server error');
      } catch (closeError) {
        this.logger.error('[WebSocket] Erro ao fechar conexão:', closeError);
      }
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

