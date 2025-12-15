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
  path: '/ws',
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
  private readonly connectionAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minuto
  private readonly RATE_LIMIT_MAX_ATTEMPTS = 5; // Máximo de 5 tentativas por minuto

  constructor(
    private readonly wsService: WebSocketService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  afterInit(server: Server) {
    this.wsService.setServer(server);
    this.logger.log('WebSocket Gateway initialized');
    this.logger.log(`[WebSocket] Server configurado: ${server ? 'OK' : 'FALHOU'}`);
    if (server) {
      this.logger.log(`[WebSocket] Server listeners: ${server.listenerCount('connection')} listener(s) de conexão`);
      this.logger.log(`[WebSocket] Server options:`, {
        path: '/ws',
        perMessageDeflate: false,
      });
    }
  }

  private getClientIdentifier(request: any): string {
    // Tentar identificar o cliente por IP ou user-agent
    const ip = request.socket?.remoteAddress || request.headers?.['x-forwarded-for'] || 'unknown';
    const userAgent = request.headers?.['user-agent'] || 'unknown';
    return `${ip}-${userAgent.substring(0, 50)}`;
  }

  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.connectionAttempts.get(identifier);

    if (!attempts) {
      this.connectionAttempts.set(identifier, { count: 1, lastAttempt: now });
      return true;
    }

    // Resetar contador se passou a janela de tempo
    if (now - attempts.lastAttempt > this.RATE_LIMIT_WINDOW) {
      this.connectionAttempts.set(identifier, { count: 1, lastAttempt: now });
      return true;
    }

    // Incrementar contador
    attempts.count++;
    attempts.lastAttempt = now;

    if (attempts.count > this.RATE_LIMIT_MAX_ATTEMPTS) {
      this.logger.warn(`[WebSocket] ⚠️ Rate limit excedido para ${identifier} (${attempts.count} tentativas)`);
      return false;
    }

    return true;
  }

  async handleConnection(client: WebSocket, ...args: any[]) {
    // Verificar se o cliente já está fechado antes de processar
    if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
      this.logger.warn('[WebSocket] ⚠️ Cliente já está fechado/fechando, ignorando conexão');
      return;
    }

    const request = args[0] as any;
    const clientIdentifier = request ? this.getClientIdentifier(request) : 'unknown';

    // Verificar rate limiting
    if (!this.checkRateLimit(clientIdentifier)) {
      if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
        client.close(1008, 'Rate limit exceeded. Please try again later.');
      }
      return;
    }

    try {
      this.logger.debug(`[WebSocket] 🔌 Nova tentativa de conexão. Estado: ${client.readyState}, Client: ${clientIdentifier.substring(0, 50)}`);

      if (!request) {
        this.logger.error('[WebSocket] ❌ Request não encontrado nos args');
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1008, 'Invalid connection request');
        }
        return;
      }

      // Extrair URL diretamente do request.url (forma padrão do WsAdapter)
      const requestUrl = request.url;
      
      if (!requestUrl) {
        this.logger.error('[WebSocket] ❌ URL não encontrada no request', {
          requestKeys: request ? Object.keys(request) : [],
          requestType: typeof request,
        });
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1008, 'Invalid connection request - URL not found');
        }
        return;
      }

      this.logger.debug(`[WebSocket] 📍 URL extraída: ${requestUrl}`);

      // Log dos headers se disponíveis (apenas em debug)
      if (request.headers && this.logger.isDebugEnabled()) {
        this.logger.debug(`[WebSocket] 📋 Headers recebidos:`, {
          origin: request.headers.origin,
          'user-agent': request.headers['user-agent']?.substring(0, 100),
        });
      }

      // Extrair token da query string de forma direta usando URLSearchParams
      let url: URL;
      try {
        // URL relativa, usar base localhost para parsing
        url = new URL(requestUrl, 'http://localhost');
      } catch (urlError) {
        this.logger.error(`[WebSocket] Erro ao parsear URL: ${requestUrl}`, urlError);
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1008, 'Invalid URL format');
        }
        return;
      }

      const token = url.searchParams.get('token');
      this.logger.debug(`[WebSocket] 🔑 Token extraído: ${token ? 'presente (' + token.substring(0, 20) + '...)' : 'ausente'}`);

      if (!token) {
        this.logger.warn('[WebSocket] ⚠️ Conexão rejeitada: token não fornecido na query string', {
          url: requestUrl,
          searchParams: url.search,
        });
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1008, 'Authentication required: token missing in query string');
        }
        return;
      }

      // Verificar e decodificar token JWT
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      if (!jwtSecret) {
        this.logger.error('[WebSocket] ❌ JWT_SECRET não configurado');
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1011, 'Server configuration error');
        }
        return;
      }

      this.logger.debug('[WebSocket] Verificando token JWT...');
      let payload: any;
      try {
        payload = jwt.verify(token, jwtSecret);
        
        // Validar que o payload tem userId
        if (!payload || !payload.userId) {
          this.logger.warn('[WebSocket] ⚠️ Token inválido: payload sem userId');
          if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
            client.close(1008, 'Invalid token: missing userId');
          }
          return;
        }
        
        this.logger.debug(`[WebSocket] ✅ Token válido para userId: ${payload.userId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let closeReason = 'Invalid token';
        
        if (errorMessage.includes('expired')) {
          closeReason = 'Token expired';
          this.logger.warn(`[WebSocket] ⚠️ Token expirado para tentativa de conexão`);
        } else if (errorMessage.includes('malformed')) {
          closeReason = 'Invalid token format';
          this.logger.warn(`[WebSocket] ⚠️ Token malformado`);
        } else {
          this.logger.warn(`[WebSocket] ⚠️ Erro ao verificar token: ${errorMessage}`);
        }
        
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1008, closeReason);
        }
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
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1008, 'User not found');
        }
        return;
      }

      if (!user.is_active) {
        this.logger.warn(`[WebSocket] Conexão rejeitada: usuário ${payload.userId} inativo`);
        if (client.readyState === WebSocket.CONNECTING || client.readyState === WebSocket.OPEN) {
          client.close(1008, 'User inactive');
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
      this.logger.debug(`[WebSocket] ✅ Cliente conectado: userId=${user.id}, email=${user.email}`);

      // Enviar mensagem de boas-vindas apenas se ainda estiver conectado
      if (client.readyState === WebSocket.OPEN) {
        try {
          const welcomeMessage = {
            type: 'connected',
            message: 'WebSocket connected successfully',
            timestamp: new Date().toISOString(),
          };
          
          // Validar estado antes de enviar
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(welcomeMessage));
            this.logger.debug(`[WebSocket] ✅ Mensagem de boas-vindas enviada para userId=${user.id}`);
          } else {
            this.logger.warn(`[WebSocket] ⚠️ Cliente não está mais aberto ao tentar enviar mensagem de boas-vindas`);
          }
        } catch (sendError) {
          this.logger.error(`[WebSocket] ❌ Erro ao enviar mensagem de boas-vindas para userId=${user.id}:`, sendError);
          // Não fechar conexão por erro ao enviar mensagem de boas-vindas
        }
      } else {
        this.logger.warn(`[WebSocket] ⚠️ Cliente não está mais aberto para enviar mensagem (estado: ${client.readyState})`);
      }
      
      // Limpar rate limit após conexão bem-sucedida
      this.connectionAttempts.delete(clientIdentifier);
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
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
          })
        );
      }
    } catch (error) {
      this.logger.error('[WebSocket] ❌ Erro ao enviar pong:', error);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { events: WebSocketEvent[] }
  ) {
    try {
      if (data && Array.isArray(data.events) && data.events.length > 0) {
        this.wsService.subscribeToEvents(client, data.events);
        
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: 'subscribed',
              events: data.events,
              timestamp: new Date().toISOString(),
            })
          );
        }
      } else {
        this.logger.warn('[WebSocket] ⚠️ Tentativa de subscribe com dados inválidos');
      }
    } catch (error) {
      this.logger.error('[WebSocket] ❌ Erro ao processar subscribe:', error);
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { events: WebSocketEvent[] }
  ) {
    try {
      if (data && Array.isArray(data.events) && data.events.length > 0) {
        this.wsService.unsubscribeFromEvents(client, data.events);
        
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: 'unsubscribed',
              events: data.events,
              timestamp: new Date().toISOString(),
            })
          );
        }
      } else {
        this.logger.warn('[WebSocket] ⚠️ Tentativa de unsubscribe com dados inválidos');
      }
    } catch (error) {
      this.logger.error('[WebSocket] ❌ Erro ao processar unsubscribe:', error);
    }
  }
}

