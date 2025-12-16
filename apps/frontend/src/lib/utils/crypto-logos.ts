/**
 * Serviço para buscar logos de criptomoedas via backend
 * O backend faz cache permanente e serve as imagens localmente
 */

// Cache em memória para a sessão atual
const logoCache = new Map<string, string | null>();

// URL da API - obtém do config da API service
function getApiUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: usar variável de ambiente
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';
  }
  // Client-side: buscar do localStorage ou usar window.location
  try {
    const storedConfig = localStorage.getItem('api_config');
    if (storedConfig) {
      const config = JSON.parse(storedConfig);
      return config.apiUrl || 'http://localhost:4010';
    }
  } catch (e) {
    // Ignorar erro
  }
  
  // Fallback: usar mesma origem do frontend
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  // Se estiver em produção (mvcash.com.br), usar core.mvcash.com.br
  if (hostname.includes('mvcash.com.br')) {
    return `${protocol}//core.mvcash.com.br`;
  }
  
  // Desenvolvimento
  return 'http://localhost:4010';
}

/**
 * Normaliza um símbolo de trading removendo sufixos comuns
 * Ex: BTCUSDT -> BTC, ETHBUSD -> ETH
 * Como os pares são sempre com USDT, simplificamos removendo apenas USDT
 */
function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$/i, '');
}


/**
 * Busca o logo de uma criptomoeda via backend
 * O backend faz cache permanente e serve imagens localmente
 * @param symbol Símbolo da criptomoeda (ex: BTCUSDT, BTC, etc)
 * @returns URL do logo ou null se não encontrado
 */
export async function getCryptoLogo(symbol: string): Promise<string | null> {
  try {
    // Verificar cache em memória primeiro
    if (logoCache.has(symbol)) {
      return logoCache.get(symbol) || null;
    }

    // Normalizar símbolo (remover USDT)
    const normalized = normalizeSymbol(symbol);

    // Buscar logo via backend
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.warn('[CryptoLogos] No auth token found');
      return null;
    }

    const apiUrl = getApiUrl();
    const url = `${apiUrl}/crypto-logos/${normalized}`;
    console.log(`[CryptoLogos] Fetching logo for ${symbol} from ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[CryptoLogos] Error fetching logo for ${symbol}:`, response.status);
      logoCache.set(symbol, null);
      return null;
    }

    const result = await response.json();
    // Backend retorna { data: { symbol, logoUrl } }
    const data = result?.data || result;
    const logoUrl = data?.logoUrl;

    // Cachear resultado (incluindo null)
    logoCache.set(symbol, logoUrl || null);
    console.log(`[CryptoLogos] Logo for ${symbol}:`, logoUrl || 'NOT FOUND');
    return logoUrl || null;
  } catch (error) {
    console.error(`[CryptoLogos] Error fetching logo for ${symbol}:`, error);
    logoCache.set(symbol, null);
    return null;
  }
}

/**
 * Busca logos para múltiplos símbolos de uma vez via backend batch endpoint
 */
export async function getCryptoLogos(symbols: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const uniqueSymbols = Array.from(new Set(symbols));
  
  // Verificar cache primeiro
  const uncachedSymbols: string[] = [];
  for (const symbol of uniqueSymbols) {
    if (logoCache.has(symbol)) {
      results.set(symbol, logoCache.get(symbol) || null);
    } else {
      uncachedSymbols.push(symbol);
    }
  }
  
  // Se todos estão em cache, retornar
  if (uncachedSymbols.length === 0) {
    return results;
  }
  
  try {
    // Buscar logos não cacheados via backend batch endpoint
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.warn('[CryptoLogos] No auth token found');
      // Preencher com null para símbolos não cacheados
      for (const symbol of uncachedSymbols) {
        results.set(symbol, null);
      }
      return results;
    }

    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/crypto-logos/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ symbols: uncachedSymbols }),
    });

    if (!response.ok) {
      console.error('[CryptoLogos] Error fetching batch logos:', response.status);
      // Preencher com null para símbolos não cacheados
      for (const symbol of uncachedSymbols) {
        results.set(symbol, null);
        logoCache.set(symbol, null);
      }
      return results;
    }

    const result = await response.json();
    // Backend retorna { data: { logos: {...} } }
    const data = result?.data || result;
    const logos = data?.logos || {};

    console.log('[CryptoLogos] Batch response:', { total: Object.keys(logos).length, logos });

    // Processar resultados e cachear
    for (const symbol of uncachedSymbols) {
      const logoUrl = logos[symbol] || null;
      results.set(symbol, logoUrl);
      logoCache.set(symbol, logoUrl);
    }
  } catch (error) {
    console.error('[CryptoLogos] Error fetching batch logos:', error);
    // Preencher com null para símbolos não cacheados
    for (const symbol of uncachedSymbols) {
      results.set(symbol, null);
      logoCache.set(symbol, null);
    }
  }
  
  return results;
}

/**
 * Limpa o cache de logos
 */
export function clearLogoCache(): void {
  logoCache.clear();
}

/**
 * Obtém o tamanho atual do cache
 */
export function getLogoCacheSize(): number {
  return logoCache.size;
}

