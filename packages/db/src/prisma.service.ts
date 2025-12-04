import { PrismaClient } from '@prisma/client';

export class PrismaService extends PrismaClient {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
    
    // Configurar connection pooling otimizado para VPS de 8 núcleos
    // Connection limit baseado em: (cores * 2) + 1 = (8 * 2) + 1 = 17
    // Pool timeout de 10 segundos para evitar conexões travadas
    // Configurações de pool são feitas via DATABASE_URL:
    // Exemplo: mysql://user:pass@host:port/db?connection_limit=17&pool_timeout=10&connect_timeout=10
    // Ou via variáveis de ambiente do Prisma
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('[PrismaService] Connection pool configurado e conectado');
    } catch (error) {
      console.error('[PrismaService] Erro ao conectar:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (error) {
      console.error('[PrismaService] Erro ao desconectar:', error);
    }
  }

  /**
   * Método helper para executar queries com retry automático em caso de conexão fechada
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Verificar se é erro de conexão fechada (P1017)
        if (error.code === 'P1017' || error.message?.includes('Server has closed the connection')) {
          if (attempt < maxRetries) {
            console.warn(`[PrismaService] Conexão fechada, tentando novamente (${attempt}/${maxRetries})...`);
            
            // Tentar reconectar
            try {
              await this.$disconnect();
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
              await this.$connect();
            } catch (reconnectError) {
              console.error('[PrismaService] Erro ao reconectar:', reconnectError);
            }
            
            continue; // Tentar novamente
          }
        }
        
        // Se não for erro de conexão ou esgotou tentativas, lançar erro
        throw error;
      }
    }
    
    throw lastError;
  }
}

