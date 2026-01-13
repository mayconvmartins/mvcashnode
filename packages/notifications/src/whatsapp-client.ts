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

  /**
   * Normaliza número de telefone para formato internacional (55XXXXXXXXXXX)
   * Aceita qualquer formato de entrada: (83) 98141-4963, 83 98141-4963, +55 83 98141-4963, etc.
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove TODOS os caracteres não-numéricos
    let digits = phone.replace(/\D/g, '');
    
    // Se começa com 0, remover (ex: 083... -> 83...)
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    
    // Se tem 10-11 dígitos (DDD + número), adicionar DDI 55 (Brasil)
    if (digits.length === 10 || digits.length === 11) {
      digits = '55' + digits;
    }
    
    // Validar formato final (deve ter 12-13 dígitos: 55 + DDD + número)
    if (digits.length < 12 || digits.length > 13) {
      console.warn(`[WHATSAPP-CLIENT] Número com formato inesperado: ${phone} -> ${digits} (${digits.length} dígitos)`);
    }
    
    return digits;
  }

  async sendMessage(phone: string, message: string): Promise<void> {
    // Obter a baseURL atual do cliente
    const currentBaseURL = this.client.defaults.baseURL || '';
    const apiUrl = currentBaseURL.replace(/\/instance\/[^/]+$/, ''); // Remover /instance/instanceName
    const instanceName = currentBaseURL.match(/\/instance\/([^/]+)$/)?.[1] || '';
    
    if (!instanceName) {
      throw new Error('Instance name not found in baseURL. Verifique a configuração da Evolution API.');
    }

    if (!apiUrl) {
      throw new Error('API URL not found. Verifique a configuração da Evolution API.');
    }

    // Normalizar número de telefone para formato internacional
    const normalizedPhone = this.normalizePhoneNumber(phone);
    const phoneWithSuffix = `${normalizedPhone}@s.whatsapp.net`;

    console.log(`[WHATSAPP-CLIENT] Enviando mensagem para ${normalizedPhone} via Evolution API`);

    const apiClient = axios.create({
      baseURL: apiUrl,
      headers: this.client.defaults.headers,
    });

    // Lista de formatos para tentar (diferentes versões da Evolution API)
    const formatsToTry = [
      // Evolution API v2 - formato mais comum (número simples)
      {
        endpoint: `/message/sendText/${instanceName}`,
        body: { number: normalizedPhone, text: message },
        description: 'v2 (número simples)',
      },
      // Evolution API v2 - formato com sufixo @s.whatsapp.net
      {
        endpoint: `/message/sendText/${instanceName}`,
        body: { number: phoneWithSuffix, text: message },
        description: 'v2 (com @s.whatsapp.net)',
      },
      // Evolution API v2 - formato alternativo com textMessage
      {
        endpoint: `/message/sendText/${instanceName}`,
        body: { number: normalizedPhone, textMessage: { text: message } },
        description: 'v2 (textMessage object)',
      },
      // Evolution API v1 - formato antigo
      {
        endpoint: `/instance/${instanceName}/send-text`,
        body: { number: normalizedPhone, text: message },
        description: 'v1 (legacy)',
      },
    ];

    let lastError: any = null;

    for (const format of formatsToTry) {
      try {
        console.log(`[WHATSAPP-CLIENT] Tentando formato ${format.description}...`);
        const response = await apiClient.post(format.endpoint, format.body);
        console.log(`[WHATSAPP-CLIENT] ✅ Mensagem enviada com sucesso para ${normalizedPhone} (${format.description})`);
        return response.data;
      } catch (error: any) {
        lastError = error;
        const statusCode = error.response?.status;
        const errorMessage = error.response?.data?.message || error.message;
        console.warn(`[WHATSAPP-CLIENT] Formato ${format.description} falhou (${statusCode}): ${errorMessage}`);
        // Continuar para próximo formato
      }
    }

    // Se todos os formatos falharam, lançar erro detalhado
    const errorMessage = lastError?.response?.data?.message || 
                        lastError?.response?.data?.error || 
                        lastError?.message || 
                        'Erro desconhecido';
    const statusCode = lastError?.response?.status;
    const errorData = lastError?.response?.data;
    
    console.error(`[WHATSAPP-CLIENT] ❌ Todos os formatos falharam para ${normalizedPhone}:`, {
      status: statusCode,
      message: errorMessage,
      data: errorData,
      attemptedFormats: formatsToTry.length,
    });
    
    throw new Error(`Failed to send WhatsApp message: ${errorMessage} (Status: ${statusCode || 'N/A'})`);
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

