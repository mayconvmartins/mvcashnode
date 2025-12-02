import axios, { AxiosInstance } from 'axios';

export class NotificationHttpService {
  private client: AxiosInstance;

  constructor(baseUrl: string = process.env.API_URL || 'http://localhost:4010') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 5000,
    });
  }

  /**
   * Envia notificação de posição aberta
   */
  async sendPositionOpened(positionId: number): Promise<void> {
    try {
      await this.client.post('/internal/notifications/position-opened', {
        positionId,
      });
    } catch (error: any) {
      // Log mas não falhar - notificações não devem bloquear o fluxo principal
      console.error(`[NOTIFICATION-HTTP] Erro ao enviar notificação de posição aberta: ${error.message}`);
    }
  }

  /**
   * Envia notificação de posição fechada
   */
  async sendPositionClosed(positionId: number): Promise<void> {
    try {
      await this.client.post('/internal/notifications/position-closed', {
        positionId,
      });
    } catch (error: any) {
      console.error(`[NOTIFICATION-HTTP] Erro ao enviar notificação de posição fechada: ${error.message}`);
    }
  }

  /**
   * Envia notificação de Stop Loss acionado
   */
  async sendStopLoss(positionId: number, executionId: number): Promise<void> {
    try {
      await this.client.post('/internal/notifications/stop-loss', {
        positionId,
        executionId,
      });
    } catch (error: any) {
      console.error(`[NOTIFICATION-HTTP] Erro ao enviar notificação de Stop Loss: ${error.message}`);
    }
  }

  /**
   * Envia notificação de Take Profit parcial
   */
  async sendPartialTP(positionId: number, executionId: number): Promise<void> {
    try {
      await this.client.post('/internal/notifications/partial-tp', {
        positionId,
        executionId,
      });
    } catch (error: any) {
      console.error(`[NOTIFICATION-HTTP] Erro ao enviar notificação de TP parcial: ${error.message}`);
    }
  }
}

