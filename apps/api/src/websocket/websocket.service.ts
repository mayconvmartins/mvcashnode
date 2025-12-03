import { Injectable, Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';

export type WebSocketEvent =
  | 'position.updated'
  | 'position.closed'
  | 'order.filled'
  | 'order.cancelled'
  | 'webhook.received'
  | 'job.completed'
  | 'job.failed'
  | 'vault.updated'
  | 'account.updated';

export interface WebSocketMessage {
  event: WebSocketEvent;
  data: any;
  timestamp: string;
}

interface AuthenticatedClient {
  socket: WebSocket;
  userId: number;
  email: string;
  subscribedEvents: Set<WebSocketEvent>;
  connectedAt: Date;
}

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);
  private server: Server | null = null;
  private clients = new Map<WebSocket, AuthenticatedClient>();

  setServer(server: Server) {
    this.server = server;
    this.logger.log('WebSocket server configured');
  }

  addClient(socket: WebSocket, userId: number, email: string) {
    const client: AuthenticatedClient = {
      socket,
      userId,
      email,
      subscribedEvents: new Set(),
      connectedAt: new Date(),
    };
    this.clients.set(socket, client);
    this.logger.log(`Client connected: userId=${userId}, email=${email}, total=${this.clients.size}`);
  }

  removeClient(socket: WebSocket) {
    const client = this.clients.get(socket);
    if (client) {
      this.clients.delete(socket);
      this.logger.log(`Client disconnected: userId=${client.userId}, total=${this.clients.size}`);
    }
  }

  subscribeToEvents(socket: WebSocket, events: WebSocketEvent[]) {
    const client = this.clients.get(socket);
    if (client) {
      events.forEach((event) => client.subscribedEvents.add(event));
      this.logger.debug(`User ${client.userId} subscribed to: ${events.join(', ')}`);
    }
  }

  unsubscribeFromEvents(socket: WebSocket, events: WebSocketEvent[]) {
    const client = this.clients.get(socket);
    if (client) {
      events.forEach((event) => client.subscribedEvents.delete(event));
      this.logger.debug(`User ${client.userId} unsubscribed from: ${events.join(', ')}`);
    }
  }

  emitToUser(userId: number, event: WebSocketEvent, data: any) {
    const message: WebSocketMessage = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.userId === userId && client.subscribedEvents.has(event)) {
        if (client.socket.readyState === WebSocket.OPEN) {
          try {
            client.socket.send(JSON.stringify(message));
            sentCount++;
          } catch (error) {
            this.logger.error(`Error sending message to user ${userId}:`, error);
          }
        }
      }
    });

    if (sentCount > 0) {
      this.logger.debug(`Emitted ${event} to user ${userId} (${sentCount} connection(s))`);
    }
  }

  broadcast(event: WebSocketEvent, data: any) {
    const message: WebSocketMessage = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.subscribedEvents.has(event)) {
        if (client.socket.readyState === WebSocket.OPEN) {
          try {
            client.socket.send(JSON.stringify(message));
            sentCount++;
          } catch (error) {
            this.logger.error(`Error broadcasting to user ${client.userId}:`, error);
          }
        }
      }
    });

    if (sentCount > 0) {
      this.logger.debug(`Broadcasted ${event} to ${sentCount} client(s)`);
    }
  }

  getConnectedUsers(): number {
    return this.clients.size;
  }

  getUserConnections(userId: number): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.userId === userId) {
        count++;
      }
    });
    return count;
  }
}

