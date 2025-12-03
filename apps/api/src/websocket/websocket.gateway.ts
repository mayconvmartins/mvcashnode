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
  path: '/',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket'],
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
    // Verificar se o cliente já está fechado antes de processar
    if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
      this.logger.warn('[WebSocket] ⚠️ Cliente já está fechado/fechando, ignorando conexão');
      return;
    }

    let requestUrl: string | null = null;
    let token: string | null = null;

    try {
      this.logger.log(`[WebSocket] 🔌 Nova tentativa de conexão. Args recebidos: ${args.length}, Estado: ${client.readyState}`);
      
      // Log detalhado dos args
      this.logger.debug(`[WebSocket] Args detalhados:`, args.map((arg, idx) => ({
        index: idx,
        type: typeof arg,
        keys: arg && typeof arg === 'object' ? Object.keys(arg) : [],
        value: arg && typeof arg === 'object' ? JSON.stringify(arg).substring(0, 200) : String(arg).substring(0, 200),
      })));

      // Extrair URL do request - WsAdapter pode passar de diferentes formas
      // Com ws nativo, o request geralmente vem como IncomingMessage
      const request = args[0] as any;
      
      if (!request) {
        this.logger.error('[WebSocket] ❌ Request não encontrado nos args');
        // Tentar usar a URL diretamente do WebSocket se disponível
        if ((client as any).url) {
          requestUrl = (client as any).url;
          this.logger.log(`[WebSocket] URL encontrada em client.url: ${requestUrl}`);
        } else {
          // Não fechar imediatamente - pode ser que o request venha depois
          setTimeout(() => {
            if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
              client.close(1008, 'Invalid connection request');
            }
          }, 100);
          return;
        }
      }

      // Tentar diferentes formatos de extração da URL
      // WsAdapter com ws nativo pode passar o request de diferentes formas
      if (!requestUrl && request) {
        if (request.url) {
          requestUrl = request.url;
          this.logger.debug(`[WebSocket] URL encontrada em request.url: ${requestUrl}`);
        } else if (request.headers && request.headers.url) {
          requestUrl = request.headers.url;
          this.logger.debug(`[WebSocket] URL encontrada em request.headers.url: ${requestUrl}`);
        } else if (typeof request === 'string') {
          requestUrl = request;
          this.logger.debug(`[WebSocket] URL encontrada como string: ${requestUrl}`);
        } else if (request._req && request._req.url) {
          requestUrl = request._req.url;
          this.logger.debug(`[WebSocket] URL encontrada em request._req.url: ${requestUrl}`);
        } else if (request.socket && request.socket._httpMessage && request.socket._httpMessage.url) {
          requestUrl = request.socket._httpMessage.url;
          this.logger.debug(`[WebSocket] URL encontrada em request.socket._httpMessage.url: ${requestUrl}`);
        } else if (args.length > 1 && typeof args[1] === 'string') {
          requestUrl = args[1];
          this.logger.debug(`[WebSocket] URL encontrada em args[1]: ${requestUrl}`);
        }
      }

      // Última tentativa: verificar se a URL está no próprio WebSocket
      if (!requestUrl && (client as any).url) {
        requestUrl = (client as any).url;
        this.logger.debug(`[WebSocket] URL encontrada em client.url: ${requestUrl}`);
      }

      if (!requestUrl) {
        this.logger.error('[WebSocket] ❌ Não foi possível extrair URL do request', {
          requestKeys: request ? Object.keys(request) : [],
          requestType: typeof request,
          argsLength: args.length,
          argsTypes: args.map(a => typeof a),
        });
        // Tentar aguardar um pouco antes de fechar - pode ser que a URL venha depois
        setTimeout(() => {
          if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
            client.close(1008, 'Invalid connection request - URL not found');
          }
        }, 200);
        return;
      }

      this.logger.log(`[WebSocket] 📍 URL extraída: ${requestUrl.substring(0, 200)}`);

      // Log dos headers se disponíveis
      if (request.headers) {
        this.logger.debug(`[WebSocket] 📋 Headers recebidos:`, {
          origin: request.headers.origin,
          'user-agent': request.headers['user-agent'],
          'sec-websocket-protocol': request.headers['sec-websocket-protocol'],
          'sec-websocket-key': request.headers['sec-websocket-key'] ? 'presente' : 'ausente',
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
      this.logger.log(`[WebSocket] 🔑 Token extraído: ${token ? 'presente (' + token.substring(0, 20) + '...)' : 'ausente'}`);

      if (!token) {
        this.logger.warn('[WebSocket] ⚠️ Conexão rejeitada: token não fornecido na query string', {
          url: requestUrl.substring(0, 200),
          searchParams: url.search,
          pathname: url.pathname,
        });
        // Fechar com código 1008 (Policy Violation) e mensagem clara
        try {
          if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
            client.close(1008, 'Authentication required: token missing in query string');
          }
        } catch (closeError) {
          this.logger.error('[WebSocket] Erro ao fechar conexão sem token:', closeError);
        }
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

      // Verificar se o cliente ainda está conectando antes de fazer operações assíncronas
      if (client.readyState !== WebSocket.CONNECTING && client.readyState !== WebSocket.OPEN) {
        this.logger.warn(`[WebSocket] ⚠️ Cliente não está mais conectando (estado: ${client.readyState}), abortando`);
        return;
      }

      // Verificar se o usuário existe e está ativo
      this.logger.debug(`[WebSocket] Verificando usuário no banco: userId=${payload.userId}`);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });

      // Verificar novamente o estado após operação assíncrona
      if (client.readyState !== WebSocket.CONNECTING && client.readyState !== WebSocket.OPEN) {
        this.logger.warn(`[WebSocket] ⚠️ Cliente desconectado durante verificação de usuário (estado: ${client.readyState})`);
        return;
      }

      if (!user) {
        this.logger.warn(`[WebSocket] Conexão rejeitada: usuário ${payload.userId} não encontrado`);
        try {
          if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
            client.close(1008, 'User not found');
          }
        } catch (closeError) {
          this.logger.error('[WebSocket] Erro ao fechar conexão (user not found):', closeError);
        }
        return;
      }

      if (!user.is_active) {
        this.logger.warn(`[WebSocket] Conexão rejeitada: usuário ${payload.userId} inativo`);
        try {
          if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
            client.close(1008, 'User inactive');
          }
        } catch (closeError) {
          this.logger.error('[WebSocket] Erro ao fechar conexão (user inactive):', closeError);
        }
        return;
      }

      // Verificar estado uma última vez antes de adicionar cliente
      if (client.readyState !== WebSocket.CONNECTING && client.readyState !== WebSocket.OPEN) {
        this.logger.warn(`[WebSocket] ⚠️ Cliente desconectado antes de adicionar (estado: ${client.readyState})`);
        return;
      }

      // Adicionar cliente autenticado
      this.wsService.addClient(client, user.id, user.email);
      this.logger.log(`[WebSocket] ✅ Cliente conectado: userId=${user.id}, email=${user.email}`);

      // Enviar mensagem de boas-vindas apenas se ainda estiver conectado
      if (client.readyState === WebSocket.OPEN) {
        try {
          const welcomeMessage = {
            type: 'connected',
            message: 'WebSocket connected successfully',
            timestamp: new Date().toISOString(),
          };
          
          client.send(JSON.stringify(welcomeMessage));
          this.logger.debug('[WebSocket] Mensagem de boas-vindas enviada');
        } catch (sendError) {
          this.logger.error('[WebSocket] Erro ao enviar mensagem de boas-vindas:', sendError);
        }
      } else {
        this.logger.warn(`[WebSocket] ⚠️ Cliente não está mais aberto para enviar mensagem (estado: ${client.readyState})`);
      }
    } catch (error) {
      this.logger.error('[WebSocket] ❌ Erro ao processar conexão:', error);
      this.logger.error('[WebSocket] Stack trace:', error instanceof Error ? error.stack : 'N/A');
      this.logger.error('[WebSocket] Estado do cliente:', {
        readyState: client.readyState,
        readyStateText: client.readyState === WebSocket.CONNECTING ? 'CONNECTING' : 
                       client.readyState === WebSocket.OPEN ? 'OPEN' :
                       client.readyState === WebSocket.CLOSING ? 'CLOSING' :
                       client.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN',
      });
      try {
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1011, 'Internal server error');
        }
      } catch (closeError) {
        this.logger.error('[WebSocket] Erro ao fechar conexão após erro:', closeError);
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

