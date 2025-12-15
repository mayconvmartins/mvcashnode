import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CacheService, CacheOptions } from '@mvcashnode/shared';

/**
 * Serviço centralizado de cache para a API
 * 
 * TTLs recomendados:
 * - Dados em tempo real (preços): 5-10s
 * - Listas de posições: 30s
 * - Listas de operações: 30s
 * - Dashboard/Summary: 60s
 * - Configurações: 5min (300s)
 * - Contas de exchange: 5min (300s)
 * 
 * Estratégia de invalidação:
 * - Invalidar cache quando há mutações (create, update, delete)
 * - Usar pattern delete para invalidar grupos de chaves
 */
@Injectable()
export class ApiCacheService implements OnModuleInit, OnModuleDestroy {
  private cacheService: CacheService;
  private isConnected = false;

  // TTLs padrão em segundos
  static readonly TTL = {
    POSITIONS_LIST: 30,
    OPERATIONS_LIST: 30,
    DASHBOARD_SUMMARY: 60,
    EXCHANGE_ACCOUNTS: 300, // 5 minutos
    PRICE: 10,
    CONFIG: 300, // 5 minutos
    USER_DATA: 60,
  };

  constructor() {
    this.cacheService = new CacheService(
      process.env.REDIS_HOST || 'localhost',
      parseInt(process.env.REDIS_PORT || '6379'),
      process.env.REDIS_PASSWORD
    );
  }

  async onModuleInit() {
    try {
      await this.cacheService.connect();
      this.isConnected = true;
      console.log('[ApiCacheService] ✅ Conectado ao Redis');
    } catch (error) {
      console.error('[ApiCacheService] ❌ Erro ao conectar ao Redis:', error);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    await this.cacheService.disconnect();
    this.isConnected = false;
  }

  /**
   * Gera chave de cache para lista de posições
   */
  static positionsKey(userId: number, filters: Record<string, any>): string {
    const filterStr = Object.entries(filters)
      .filter(([_, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    return `positions:user:${userId}:${filterStr}`;
  }

  /**
   * Gera chave de cache para lista de operações
   */
  static operationsKey(userId: number, filters: Record<string, any>): string {
    const filterStr = Object.entries(filters)
      .filter(([_, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');
    return `operations:user:${userId}:${filterStr}`;
  }

  /**
   * Gera chave de cache para dashboard summary
   */
  static dashboardKey(userId: number, tradeMode?: string): string {
    return `dashboard:user:${userId}:mode:${tradeMode || 'all'}`;
  }

  /**
   * Gera chave de cache para contas de exchange
   */
  static accountsKey(userId: number): string {
    return `accounts:user:${userId}`;
  }

  /**
   * Gera chave de cache para relatórios
   */
  static reportsKey(userId: number, reportType: string, params?: Record<string, any>): string {
    const paramsStr = params 
      ? Object.entries(params)
          .filter(([_, v]) => v !== undefined && v !== null)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}:${v}`)
          .join(':')
      : '';
    return `reports:user:${userId}:type:${reportType}:${paramsStr}`;
  }

  /**
   * Obtém valor do cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    return this.cacheService.get<T>(key);
  }

  /**
   * Define valor no cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected) return false;
    return this.cacheService.set(key, value, options);
  }

  /**
   * Remove chave do cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConnected) return false;
    return this.cacheService.delete(key);
  }

  /**
   * Remove chaves por padrão
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isConnected) return 0;
    return this.cacheService.deletePattern(pattern);
  }

  /**
   * Invalida cache de posições do usuário
   */
  async invalidatePositions(userId: number): Promise<void> {
    await this.deletePattern(`positions:user:${userId}:*`);
    console.log(`[ApiCacheService] Cache de posições invalidado para usuário ${userId}`);
  }

  /**
   * Invalida cache de operações do usuário
   */
  async invalidateOperations(userId: number): Promise<void> {
    await this.deletePattern(`operations:user:${userId}:*`);
    console.log(`[ApiCacheService] Cache de operações invalidado para usuário ${userId}`);
  }

  /**
   * Invalida cache de dashboard do usuário
   */
  async invalidateDashboard(userId: number): Promise<void> {
    await this.deletePattern(`dashboard:user:${userId}:*`);
    console.log(`[ApiCacheService] Cache de dashboard invalidado para usuário ${userId}`);
  }

  /**
   * Invalida cache de relatórios do usuário
   */
  async invalidateReports(userId: number): Promise<void> {
    await this.deletePattern(`reports:user:${userId}:*`);
    console.log(`[ApiCacheService] Cache de relatórios invalidado para usuário ${userId}`);
  }

  /**
   * Invalida cache de contas de exchange do usuário
   */
  async invalidateAccounts(userId: number): Promise<void> {
    await this.delete(ApiCacheService.accountsKey(userId));
    console.log(`[ApiCacheService] Cache de contas invalidado para usuário ${userId}`);
  }

  /**
   * Invalida todo o cache do usuário
   */
  async invalidateAll(userId: number): Promise<void> {
    await Promise.all([
      this.invalidatePositions(userId),
      this.invalidateOperations(userId),
      this.invalidateDashboard(userId),
      this.invalidateReports(userId),
      this.invalidateAccounts(userId),
    ]);
    console.log(`[ApiCacheService] Todo cache invalidado para usuário ${userId}`);
  }

  /**
   * Wrapper para executar função com cache
   * Se cache existe e não está expirado, retorna do cache
   * Caso contrário, executa função e cacheia resultado
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    // Tentar obter do cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Executar fetcher e cachear
    const result = await fetcher();
    await this.set(key, result, { ttl });
    return result;
  }

  /**
   * Verifica se o serviço está conectado ao Redis
   */
  isHealthy(): boolean {
    return this.isConnected;
  }
}

