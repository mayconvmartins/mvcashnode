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
      const response = await this.client.post('/send-text', {
        number: phone,
        text: message,
      });
      console.log(`[WHATSAPP-CLIENT] Mensagem enviada com sucesso para ${phone}`);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      const statusCode = error.response?.status;
      console.error(`[WHATSAPP-CLIENT] Erro ao enviar mensagem para ${phone}:`, {
        status: statusCode,
        message: errorMessage,
        data: error.response?.data,
      });
      throw new Error(`Failed to send WhatsApp message: ${errorMessage} (Status: ${statusCode || 'N/A'})`);
    }
  }

  async sendToGroup(groupId: string, message: string): Promise<void> {
    // Usar o método que funciona: Evolution API v2 - message/sendText/{instance}
    // Obter a baseURL atual do cliente
    const currentBaseURL = this.client.defaults.baseURL || '';
    const apiUrl = currentBaseURL.replace(/\/instance\/[^/]+$/, ''); // Remover /instance/instanceName
    const instanceName = currentBaseURL.match(/\/instance\/([^/]+)$/)?.[1] || '';
    
    if (!instanceName) {
      throw new Error('Instance name not found in baseURL');
    }

    console.log(`[WHATSAPP-CLIENT] Enviando para grupo ${groupId} via message/sendText/${instanceName}`);
    
    try {
      // Criar cliente com baseURL da API (sem /instance/instanceName)
      const apiClient = axios.create({
        baseURL: apiUrl,
        headers: this.client.defaults.headers,
      });

      const response = await apiClient.post(`/message/sendText/${instanceName}`, {
        number: groupId,
        text: message,
      });

      console.log(`[WHATSAPP-CLIENT] ✅ Mensagem enviada com sucesso para grupo ${groupId}`);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      const statusCode = error.response?.status;
      console.error(`[WHATSAPP-CLIENT] ❌ Erro ao enviar mensagem para grupo ${groupId}:`, {
        status: statusCode,
        message: errorMessage,
        data: error.response?.data,
      });
      throw new Error(`Failed to send WhatsApp message to group: ${errorMessage} (Status: ${statusCode || 'N/A'})`);
    }
  }
}

