import { createClient, RedisClientType } from 'redis';

export interface CacheOptions {
  ttl?: number; // Time to live em segundos (máximo 25s para preços)
}

export class CacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor(
    private host: string = process.env.REDIS_HOST || 'localhost',
    private port: number = parseInt(process.env.REDIS_PORT || '6379'),
    private password?: string
  ) {}

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const url = this.password 
        ? `redis://:${this.password}@${this.host}:${this.port}`
        : `redis://${this.host}:${this.port}`;

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
   * Para preços de corretoras, o TTL máximo é 25 segundos
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (!this.client) return false;

      // Garantir que TTL de preços não exceda 25 segundos
      let ttl = options?.ttl;
      if (key.startsWith('price:') && ttl && ttl > 25) {
        console.warn(`[CacheService] TTL de preço excedeu 25s (${ttl}s), limitando a 25s`);
        ttl = 25;
      }

      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      return true;
    } catch (error) {
      console.error(`[CacheService] Erro ao definir chave ${key}:`, error);
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

