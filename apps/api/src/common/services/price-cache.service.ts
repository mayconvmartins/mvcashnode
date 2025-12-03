import { Injectable } from '@nestjs/common';

interface CachedPrice {
  price: number;
  timestamp: number;
}

@Injectable()
export class PriceCacheService {
  private priceCache: Map<string, CachedPrice> = new Map();
  private readonly PRICE_CACHE_TTL = 25000; // 25 segundos

  /**
   * Obtém preço do cache se ainda válido
   */
  getCachedPrice(symbol: string, exchange: string): number | null {
    const key = this.getCacheKey(symbol, exchange);
    const cached = this.priceCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price;
    }
    
    // Remover do cache se expirado
    if (cached) {
      this.priceCache.delete(key);
    }
    
    return null;
  }

  /**
   * Armazena preço no cache
   */
  setCachedPrice(symbol: string, exchange: string, price: number): void {
    const key = this.getCacheKey(symbol, exchange);
    this.priceCache.set(key, {
      price,
      timestamp: Date.now(),
    });
  }

  /**
   * Obtém preço do cache ou retorna null se não existir/válido
   */
  getOrFetchPrice(
    symbol: string,
    exchange: string,
    fetchFn: () => Promise<number>
  ): Promise<number> {
    const cached = this.getCachedPrice(symbol, exchange);
    if (cached !== null) {
      return Promise.resolve(cached);
    }

    return fetchFn().then((price) => {
      if (price && price > 0) {
        this.setCachedPrice(symbol, exchange, price);
      }
      return price;
    });
  }

  /**
   * Limpa cache expirado (opcional, pode ser chamado periodicamente)
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, cached] of this.priceCache.entries()) {
      if (now - cached.timestamp >= this.PRICE_CACHE_TTL) {
        this.priceCache.delete(key);
      }
    }
  }

  /**
   * Limpa todo o cache
   */
  clearAll(): void {
    this.priceCache.clear();
  }

  /**
   * Gera chave de cache
   */
  private getCacheKey(symbol: string, exchange: string): string {
    return `${exchange}:${symbol}`;
  }

  /**
   * Obtém estatísticas do cache (útil para debug)
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.priceCache.size,
      keys: Array.from(this.priceCache.keys()),
    };
  }
}

