import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '@mvcashnode/shared';

interface SlowQueryMetric {
  method: string;
  path: string;
  duration: number;
  timestamp: string;
  userId?: number;
}

interface PerformanceStats {
  totalRequests: number;
  slowRequests: number;
  verySlowRequests: number;
  avgDuration: number;
  maxDuration: number;
  lastUpdated: string;
}

/**
 * Interceptor de performance para monitorar e logar métricas de requisições
 * 
 * Funcionalidades:
 * - Loga requisições lentas (>500ms) e muito lentas (>2s)
 * - Armazena métricas no Redis para análise posterior
 * - Mantém estatísticas agregadas por endpoint
 * - Adiciona header X-Response-Time em todas as respostas
 */
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);
  private readonly SLOW_QUERY_THRESHOLD = 500; // 500ms
  private readonly VERY_SLOW_QUERY_THRESHOLD = 2000; // 2 segundos
  private readonly METRICS_TTL = 3600; // 1 hora de TTL para métricas
  private readonly MAX_SLOW_QUERIES = 100; // Máximo de queries lentas armazenadas
  
  private cacheService: CacheService | null = null;
  private isRedisConnected = false;
  private connectionAttempted = false;

  constructor() {
    // Tentar conectar ao Redis de forma assíncrona
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    if (this.connectionAttempted) return;
    this.connectionAttempted = true;
    
    try {
      this.cacheService = new CacheService(
        process.env.REDIS_HOST || 'localhost',
        parseInt(process.env.REDIS_PORT || '6379'),
        process.env.REDIS_PASSWORD
      );
      await this.cacheService.connect();
      this.isRedisConnected = true;
      this.logger.log('✅ Performance metrics conectado ao Redis');
    } catch (error) {
      this.logger.warn('⚠️ Redis não disponível para métricas de performance');
      this.isRedisConnected = false;
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, route } = request;
    const startTime = Date.now();
    const userId = request.user?.userId;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const routePath = route?.path || url;

          // Adicionar header de tempo de resposta
          const response = context.switchToHttp().getResponse();
          response.setHeader('X-Response-Time', `${duration}ms`);

          // Logar e armazenar métricas
          this.handleMetrics(method, routePath, duration, userId);
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const routePath = route?.path || url;
          
          this.logger.error(
            `❌ Erro em ${method} ${routePath} após ${duration}ms: ${error.message}`,
          );
          
          // Armazenar métricas mesmo em caso de erro
          this.handleMetrics(method, routePath, duration, userId, true);
        },
      }),
    );
  }

  /**
   * Processa e armazena métricas de performance
   */
  private async handleMetrics(
    method: string,
    routePath: string,
    duration: number,
    userId?: number,
    isError: boolean = false
  ): Promise<void> {
    // Log de queries lentas
    if (duration > this.VERY_SLOW_QUERY_THRESHOLD) {
      this.logger.warn(
        `🐌 Query MUITO LENTA: ${method} ${routePath} - ${duration}ms${userId ? ` (user: ${userId})` : ''}`,
      );
      await this.storeSlowQuery(method, routePath, duration, userId, 'very_slow');
    } else if (duration > this.SLOW_QUERY_THRESHOLD) {
      this.logger.warn(
        `⚠️ Query lenta: ${method} ${routePath} - ${duration}ms${userId ? ` (user: ${userId})` : ''}`,
      );
      await this.storeSlowQuery(method, routePath, duration, userId, 'slow');
    } else if (process.env.LOG_PERFORMANCE === 'true') {
      // Log detalhado apenas se habilitado via env
      this.logger.debug(
        `✅ ${method} ${routePath} - ${duration}ms`,
      );
    }

    // Atualizar estatísticas agregadas
    await this.updateStats(method, routePath, duration);
  }

  /**
   * Armazena query lenta no Redis
   */
  private async storeSlowQuery(
    method: string,
    path: string,
    duration: number,
    userId?: number,
    type: 'slow' | 'very_slow' = 'slow'
  ): Promise<void> {
    if (!this.isRedisConnected || !this.cacheService) return;

    try {
      const metric: SlowQueryMetric = {
        method,
        path,
        duration,
        timestamp: new Date().toISOString(),
        userId,
      };

      // Armazenar em lista no Redis
      const key = `performance:${type}_queries`;
      const existingData = await this.cacheService.get<SlowQueryMetric[]>(key) || [];
      
      // Manter apenas as últimas MAX_SLOW_QUERIES queries
      const updatedData = [metric, ...existingData].slice(0, this.MAX_SLOW_QUERIES);
      
      await this.cacheService.set(key, updatedData, { ttl: this.METRICS_TTL });
    } catch (error) {
      // Não falhar se Redis não disponível
    }
  }

  /**
   * Atualiza estatísticas agregadas por endpoint
   */
  private async updateStats(
    method: string,
    path: string,
    duration: number
  ): Promise<void> {
    if (!this.isRedisConnected || !this.cacheService) return;

    try {
      // Normalizar path para evitar variáveis (ex: /positions/123 -> /positions/:id)
      const normalizedPath = this.normalizePath(path);
      const key = `performance:stats:${method}:${normalizedPath}`;
      
      const existingStats = await this.cacheService.get<PerformanceStats>(key) || {
        totalRequests: 0,
        slowRequests: 0,
        verySlowRequests: 0,
        avgDuration: 0,
        maxDuration: 0,
        lastUpdated: '',
      };

      // Atualizar estatísticas
      const newTotalRequests = existingStats.totalRequests + 1;
      const newAvgDuration = (
        (existingStats.avgDuration * existingStats.totalRequests) + duration
      ) / newTotalRequests;

      const updatedStats: PerformanceStats = {
        totalRequests: newTotalRequests,
        slowRequests: existingStats.slowRequests + (duration > this.SLOW_QUERY_THRESHOLD ? 1 : 0),
        verySlowRequests: existingStats.verySlowRequests + (duration > this.VERY_SLOW_QUERY_THRESHOLD ? 1 : 0),
        avgDuration: Math.round(newAvgDuration * 100) / 100,
        maxDuration: Math.max(existingStats.maxDuration, duration),
        lastUpdated: new Date().toISOString(),
      };

      await this.cacheService.set(key, updatedStats, { ttl: this.METRICS_TTL });
    } catch (error) {
      // Não falhar se Redis não disponível
    }
  }

  /**
   * Normaliza path para agrupar rotas com parâmetros
   * Ex: /positions/123 -> /positions/:id
   */
  private normalizePath(path: string): string {
    // Remove query string
    const pathWithoutQuery = path.split('?')[0];
    
    // Substitui números por :id
    return pathWithoutQuery.replace(/\/\d+/g, '/:id');
  }

  /**
   * Obtém queries lentas armazenadas (útil para endpoint de monitoramento)
   */
  async getSlowQueries(type: 'slow' | 'very_slow' = 'slow'): Promise<SlowQueryMetric[]> {
    if (!this.isRedisConnected || !this.cacheService) return [];
    
    try {
      const key = `performance:${type}_queries`;
      return await this.cacheService.get<SlowQueryMetric[]>(key) || [];
    } catch {
      return [];
    }
  }

  /**
   * Obtém estatísticas de performance agregadas
   */
  async getStats(): Promise<Record<string, PerformanceStats>> {
    if (!this.isRedisConnected || !this.cacheService) return {};
    
    try {
      // Buscar todas as chaves de stats
      // Nota: Isso requer acesso ao Redis keys pattern, que não está disponível no CacheService
      // Por enquanto, retornamos vazio - pode ser expandido no futuro
      return {};
    } catch {
      return {};
    }
  }
}
