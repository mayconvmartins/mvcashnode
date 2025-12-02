import axios, { AxiosInstance } from 'axios';

export interface WhatsAppConfig {
  apiUrl: string;
  apiKey?: string;
  instanceName: string;
}

export class WhatsAppClient {
  private client: AxiosInstance;

  constructor(config: WhatsAppConfig) {
    this.client = axios.create({
      baseURL: `${config.apiUrl}/instance/${config.instanceName}`,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'apikey': config.apiKey }),
      },
    });
  }

  async sendMessage(phone: string, message: string): Promise<void> {
    try {
      await this.client.post('/send-text', {
        number: phone,
        text: message,
      });
    } catch (error: any) {
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  }
}

