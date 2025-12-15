import { PrismaClient } from '@prisma/client';

/**
 * PrismaService com connection pool otimizado para VPS de 20 núcleos e 64GB RAM
 * 
 * IMPORTANTE: Configurar a DATABASE_URL com os parâmetros de pool:
 * mysql://user:pass@host:port/db?connection_limit=41&pool_timeout=10&connect_timeout=10
 * 
 * Fórmula recomendada: connection_limit = (cores * 2) + 1 = (20 * 2) + 1 = 41
 * 
 * Parâmetros explicados:
 * - connection_limit: Máximo de conexões simultâneas (41 para 20 núcleos)
 * - pool_timeout: Tempo máximo (segundos) para obter conexão do pool (10s)
 * - connect_timeout: Tempo máximo (segundos) para estabelecer conexão (10s)
 * 
 * Para clusters PM2 (múltiplas instâncias da API):
 * - Se rodar 8 instâncias da API, cada uma terá ~5 conexões (41/8)
 * - Ajustar max_connections do MySQL para suportar: 300-500 conexões
 */
export class PrismaService extends PrismaClient {
  private static instance: PrismaService | null = null;
  private connectionAttempts = 0;
  private maxConnectionAttempts = 5;
  private reconnectDelay = 1000;

  constructor() {
    // Configurar logging baseado no ambiente
    const logLevel = process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] as const
      : process.env.PRISMA_LOG_QUERIES === 'true'
        ? ['query', 'error', 'warn'] as const
        : ['error'] as const;

    super({
      log: [...logLevel],
      // Configurações adicionais de datasource são feitas via DATABASE_URL
    });

    // Log de configuração na inicialização
    const dbUrl = process.env.DATABASE_URL || '';
    const hasPoolConfig = dbUrl.includes('connection_limit');
    
    if (!hasPoolConfig) {
      console.warn('[PrismaService] ⚠️ DATABASE_URL não contém configurações de pool!');
      console.warn('[PrismaService] Adicione: ?connection_limit=41&pool_timeout=10&connect_timeout=10');
    } else {
      console.log('[PrismaService] ✅ Connection pool configurado via DATABASE_URL');
    }
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      console.log('[PrismaService] Desconectado do banco de dados');
    } catch (error) {
      console.error('[PrismaService] Erro ao desconectar:', error);
    }
  }

  /**
   * Conecta ao banco com retry automático e backoff exponencial
   */
  private async connectWithRetry(): Promise<void> {
    while (this.connectionAttempts < this.maxConnectionAttempts) {
      try {
        this.connectionAttempts++;
        await this.$connect();
        console.log('[PrismaService] ✅ Connection pool conectado com sucesso');
        this.connectionAttempts = 0; // Reset após sucesso
        return;
      } catch (error: any) {
        console.error(`[PrismaService] ❌ Tentativa ${this.connectionAttempts}/${this.maxConnectionAttempts} falhou:`, error.message);
        
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
          console.error('[PrismaService] Máximo de tentativas atingido, falha ao conectar');
          throw error;
        }
        
        // Backoff exponencial: 1s, 2s, 4s, 8s, 16s
        const delay = this.reconnectDelay * Math.pow(2, this.connectionAttempts - 1);
        console.log(`[PrismaService] Aguardando ${delay}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Health check para verificar se a conexão está ativa
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return { status: 'ok', latency: Date.now() - start };
    } catch (error: any) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Obtém métricas do pool de conexões (quando disponível)
   */
  async getPoolMetrics(): Promise<{
    activeConnections?: number;
    idleConnections?: number;
    waitingQueries?: number;
  }> {
    try {
      // MySQL: verificar conexões ativas
      const result = await this.$queryRaw<any[]>`
        SELECT COUNT(*) as active_connections 
        FROM information_schema.PROCESSLIST 
        WHERE DB = DATABASE()
      `;
      return {
        activeConnections: result[0]?.active_connections || 0,
      };
    } catch {
      return {};
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

