import { createClient, RedisClientType } from 'redis';

export interface CacheOptions {
  ttl?: number; // Time to live em segundos (máximo configurável via CACHE_PRICE_TTL_MAX para preços, padrão: 25s)
}

export class CacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  // ✅ BUG-BAIXO-002 FIX: TTL configurável via variável de ambiente
  private readonly priceTtlMax: number;

  constructor(
    private host: string = process.env.REDIS_HOST || 'localhost',
    private port: number = parseInt(process.env.REDIS_PORT || '6379'),
    private password?: string
  ) {
    // TTL máximo para preços (padrão: 25 segundos)
    this.priceTtlMax = parseInt(process.env.CACHE_PRICE_TTL_MAX || '25', 10);
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const url = this.password 
        ? `redis://:${this.password}@${this.host}:${this.port}`
        : `redis://${this.host}:${this.port}`;

      // ✅ BUG-ALTO-001 FIX: Configuração de limite de memória e eviction policy
      // IMPORTANTE: Configure o Redis com as seguintes opções:
      // maxmemory 512mb
      // maxmemory-policy allkeys-lru
      // Isso deve ser feito no arquivo redis.conf ou via comando:
      // CONFIG SET maxmemory 512mb
      // CONFIG SET maxmemory-policy allkeys-lru
      // 
      // A política allkeys-lru remove as chaves menos recentemente usadas quando
      // a memória está cheia, evitando que o Redis consuma toda a memória do servidor.

      this.client = createClient({
        url,
      });

      this.client.on('error', (err) => {
        console.error('[CacheService] Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('[CacheService] Conectado ao Redis');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('[CacheService] Desconectado do Redis');
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      console.error('[CacheService] Erro ao conectar ao Redis:', error);
      this.isConnected = false;
      // Não lançar erro para permitir fallback quando Redis não estiver disponível
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        // ✅ BUG-MED-001 FIX: Remover todos os listeners antes de desconectar
        this.client.removeAllListeners();
        await this.client.quit();
      } catch (error) {
        // Ignorar erros ao desconectar
      }
      this.client = null;
      this.isConnected = false;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
    
    // Verificar se o cliente está realmente conectado e autenticado
    if (this.client && !this.isConnected) {
      // Tentar reconectar se não estiver conectado
      try {
        await this.client.ping();
        this.isConnected = true;
      } catch (error: any) {
        // Se houver erro de autenticação ou conexão, tentar reconectar
        if (error?.message?.includes('NOAUTH') || error?.message?.includes('Authentication required')) {
          console.warn('[CacheService] Erro de autenticação detectado, tentando reconectar...');
          this.isConnected = false;
          this.client = null;
          await this.connect();
        } else {
          // Outros erros, apenas marcar como desconectado
          this.isConnected = false;
        }
      }
    }
  }

  /**
   * Obtém um valor do cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      await this.ensureConnected();
      if (!this.client) return null;

      const value = await this.client.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[CacheService] Erro ao obter chave ${key}:`, error);
      return null;
    }
  }

  /**
   * Define um valor no cache com TTL opcional
   * Para preços de corretoras, o TTL máximo é configurável via CACHE_PRICE_TTL_MAX (padrão: 25s)
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (!this.client || !this.isConnected) {
        console.warn(`[CacheService] Cliente Redis não disponível, pulando cache para chave ${key}`);
        return false;
      }

      // ✅ BUG-BAIXO-002 FIX: TTL configurável via variável de ambiente
      // Garantir que TTL de preços não exceda o máximo configurado
      let ttl = options?.ttl;
      if (key.startsWith('price:') && ttl && ttl > this.priceTtlMax) {
        console.warn(`[CacheService] TTL de preço excedeu ${this.priceTtlMax}s (${ttl}s), limitando a ${this.priceTtlMax}s`);
        ttl = this.priceTtlMax;
      }

      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      return true;
    } catch (error: any) {
      // Se for erro de autenticação, marcar como desconectado e não tentar novamente nesta execução
      if (error?.message?.includes('NOAUTH') || error?.message?.includes('Authentication required')) {
        console.error(`[CacheService] Erro de autenticação ao definir chave ${key}:`, error.message);
        this.isConnected = false;
        // Não tentar reconectar aqui para evitar loop infinito
      } else {
        console.error(`[CacheService] Erro ao definir chave ${key}:`, error);
      }
      return false;
    }
  }

  /**
   * Remove uma chave do cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (!this.client) return false;

      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`[CacheService] Erro ao deletar chave ${key}:`, error);
      return false;
    }
  }

  /**
   * Remove múltiplas chaves do cache (usando padrão)
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      await this.ensureConnected();
      if (!this.client) return 0;

      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;

      return await this.client.del(keys);
    } catch (error) {
      console.error(`[CacheService] Erro ao deletar padrão ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Verifica se uma chave existe no cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (!this.client) return false;

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[CacheService] Erro ao verificar existência da chave ${key}:`, error);
      return false;
    }
  }

  /**
   * Define TTL para uma chave existente
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (!this.client) return false;

      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      console.error(`[CacheService] Erro ao definir TTL para chave ${key}:`, error);
      return false;
    }
  }

  /**
   * Obtém múltiplas chaves de uma vez
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      await this.ensureConnected();
      if (!this.client) return keys.map(() => null);

      const values = await this.client.mGet(keys);
      return values.map((value) => {
        if (!value) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error(`[CacheService] Erro ao obter múltiplas chaves:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Define múltiplas chaves de uma vez
   */
  async mset(keyValues: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (!this.client) return false;

      // Para mset com TTL, precisamos fazer individualmente
      const promises = keyValues.map(({ key, value, ttl }) => {
        return this.set(key, value, { ttl });
      });

      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error(`[CacheService] Erro ao definir múltiplas chaves:`, error);
      return false;
    }
  }

  /**
   * Incrementa um valor numérico
   */
  async increment(key: string, by: number = 1): Promise<number | null> {
    try {
      await this.ensureConnected();
      if (!this.client) return null;

      return await this.client.incrBy(key, by);
    } catch (error) {
      console.error(`[CacheService] Erro ao incrementar chave ${key}:`, error);
      return null;
    }
  }

  /**
   * Decrementa um valor numérico
   */
  async decrement(key: string, by: number = 1): Promise<number | null> {
    try {
      await this.ensureConnected();
      if (!this.client) return null;

      return await this.client.decrBy(key, by);
    } catch (error) {
      console.error(`[CacheService] Erro ao decrementar chave ${key}:`, error);
      return null;
    }
  }
}

