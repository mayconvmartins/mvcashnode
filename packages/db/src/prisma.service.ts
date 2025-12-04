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
    // Exemplo: mysql://user:pass@host:port/db?connection_limit=17&pool_timeout=10
    // Ou via variáveis de ambiente do Prisma
  }

  async onModuleInit() {
    await this.$connect();
    console.log('[PrismaService] Connection pool configurado e conectado');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

