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
    // Evolution API pode usar diferentes endpoints/formats para grupos
    // Tentar diferentes formatos e URLs
    
    // Obter a baseURL atual do cliente
    const currentBaseURL = this.client.defaults.baseURL || '';
    const apiUrl = currentBaseURL.replace(/\/instance\/[^/]+$/, ''); // Remover /instance/instanceName
    const instanceName = currentBaseURL.match(/\/instance\/([^/]+)$/)?.[1] || '';
    
    console.log(`[WHATSAPP-CLIENT] Enviando para grupo ${groupId}`);
    console.log(`[WHATSAPP-CLIENT] BaseURL atual: ${currentBaseURL}`);
    console.log(`[WHATSAPP-CLIENT] API URL: ${apiUrl}, Instance: ${instanceName}`);
    
    const attempts = [
      // Formato 1: Usar send-text com groupId diretamente (formato atual)
      {
        client: this.client,
        endpoint: '/send-text',
        body: { number: groupId, text: message },
        description: 'send-text com groupId',
      },
      // Formato 2: Usar sendText (v2) com groupId
      {
        client: this.client,
        endpoint: '/sendText',
        body: { number: groupId, text: message },
        description: 'sendText com groupId',
      },
      // Formato 3: Usar sendText com textMessage
      {
        client: this.client,
        endpoint: '/sendText',
        body: { 
          number: groupId, 
          textMessage: { text: message }
        },
        description: 'sendText com textMessage',
      },
      // Formato 4: Evolution API v2 - message/sendText/{instance}
      {
        client: axios.create({
          baseURL: apiUrl,
          headers: this.client.defaults.headers,
        }),
        endpoint: `/message/sendText/${instanceName}`,
        body: { number: groupId, text: message },
        description: 'message/sendText/{instance}',
      },
      // Formato 5: Evolution API v2 - message/sendText/{instance} com textMessage
      {
        client: axios.create({
          baseURL: apiUrl,
          headers: this.client.defaults.headers,
        }),
        endpoint: `/message/sendText/${instanceName}`,
        body: { 
          number: groupId, 
          textMessage: { text: message }
        },
        description: 'message/sendText/{instance} com textMessage',
      },
    ];

    let lastError: any = null;
    
    for (const attempt of attempts) {
      try {
        console.log(`[WHATSAPP-CLIENT] Tentando formato: ${attempt.description}...`);
        const response = await attempt.client.post(attempt.endpoint, attempt.body);
        console.log(`[WHATSAPP-CLIENT] ✅ Mensagem enviada com sucesso para grupo ${groupId} via ${attempt.description}`);
        return response.data;
      } catch (error: any) {
        const statusCode = error.response?.status;
        const errorMessage = error.response?.data?.message || error.message;
        const errorData = error.response?.data;
        console.warn(`[WHATSAPP-CLIENT] Tentativa falhou (${attempt.description}):`, {
          status: statusCode,
          message: errorMessage,
          data: errorData,
          url: error.config?.url,
        });
        lastError = error;
        // Continuar para próxima tentativa
      }
    }

    // Se todas as tentativas falharam, lançar erro
    const finalMessage = lastError?.response?.data?.message || lastError?.message || 'Unknown error';
    const finalStatus = lastError?.response?.status || 'N/A';
    const finalData = lastError?.response?.data;
    console.error(`[WHATSAPP-CLIENT] ❌ Todas as tentativas falharam para grupo ${groupId}`);
    console.error(`[WHATSAPP-CLIENT] Último erro:`, {
      status: finalStatus,
      message: finalMessage,
      data: finalData,
    });
    throw new Error(`Failed to send WhatsApp message to group: ${finalMessage} (Status: ${finalStatus})`);
  }
}

