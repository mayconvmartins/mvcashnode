/**
 * Serviço para buscar logos de criptomoedas via CoinGecko API
 * API pública e gratuita, sem necessidade de chave
 */

// Cache em memória para evitar chamadas repetidas
const logoCache = new Map<string, string>();

// Mapeamento de símbolos de trading para IDs do CoinGecko
const symbolToCoinGeckoId: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LTC: 'litecoin',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ALGO: 'algorand',
  FIL: 'filecoin',
  TRX: 'tron',
  NEAR: 'near',
  VET: 'vechain',
  ICP: 'internet-computer',
  APT: 'aptos',
  HBAR: 'hedera-hashgraph',
  QNT: 'quant-network',
  ARB: 'arbitrum',
  OP: 'optimism',
  INJ: 'injective-protocol',
  SUI: 'sui',
  STX: 'blockstack',
  RUNE: 'thorchain',
  FTM: 'fantom',
  AAVE: 'aave',
  GRT: 'the-graph',
  MKR: 'maker',
  SNX: 'havven',
  LDO: 'lido-dao',
  CRV: 'curve-dao-token',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  AXS: 'axie-infinity',
  APE: 'apecoin',
  SHIB: 'shiba-inu',
  WOO: 'woo-network',
  PEPE: 'pepe',
  FET: 'fetch-ai',
  RENDER: 'render-token',
  IMX: 'immutable-x',
  TIA: 'celestia',
  SEI: 'sei-network',
  ORDI: 'ordinals',
  JUP: 'jupiter-exchange-solana',
  WLD: 'worldcoin-wld',
  BONK: 'bonk',
  PYTH: 'pyth-network',
  JTO: 'jito-governance-token',
  WIF: 'dogwifcoin',
  MEME: 'memecoin-2',
};

/**
 * Normaliza um símbolo de trading removendo sufixos comuns
 * Ex: BTCUSDT -> BTC, ETHBUSD -> ETH
 */
function normalizeSymbol(symbol: string): string {
  // Remover sufixos comuns (ordenados do mais longo ao mais curto para evitar remoções parciais)
  const suffixes = ['USDT', 'BUSD', 'USDC', 'TUSD', 'FDUSD', 'USD', 'BTC', 'ETH', 'BNB', 'EUR', 'GBP'];
  let normalized = symbol.toUpperCase();
  
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      const base = normalized.slice(0, -suffix.length);
      // Verificar se o que sobrou é um símbolo válido
      if (base.length >= 2 && base.length <= 10) {
        return base;
      }
    }
  }
  
  return normalized;
}

/**
 * Obtém o ID do CoinGecko para um símbolo
 */
function getCoinGeckoId(symbol: string): string | null {
  const normalized = normalizeSymbol(symbol);
  return symbolToCoinGeckoId[normalized] || null;
}

/**
 * Busca o logo de uma criptomoeda via CoinGecko API
 * @param symbol Símbolo da criptomoeda (ex: BTCUSDT, BTC, etc)
 * @returns URL do logo ou null se não encontrado
 */
export async function getCryptoLogo(symbol: string): Promise<string | null> {
  try {
    // Verificar cache primeiro
    if (logoCache.has(symbol)) {
      return logoCache.get(symbol) || null;
    }

    const coinId = getCoinGeckoId(symbol);
    
    if (!coinId) {
      console.warn(`[CryptoLogos] Símbolo não mapeado: ${symbol}`);
      return null;
    }

    // Buscar logo via CoinGecko API
    // Usando endpoint mais simples e específico
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`[CryptoLogos] Erro ao buscar logo para ${symbol} (${coinId}):`, response.status);
      return null;
    }

    const data = await response.json();
    const logoUrl = data?.image?.small || data?.image?.thumb || data?.image?.large;

    if (logoUrl) {
      // Cachear resultado
      logoCache.set(symbol, logoUrl);
      return logoUrl;
    }

    return null;
  } catch (error) {
    console.error(`[CryptoLogos] Erro ao buscar logo para ${symbol}:`, error);
    return null;
  }
}

/**
 * Busca logos para múltiplos símbolos de uma vez
 * Usa rate limiting para evitar sobrecarga da API
 */
export async function getCryptoLogos(symbols: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const uniqueSymbols = Array.from(new Set(symbols));
  
  // Processar em lotes de 5 para evitar rate limiting
  const batchSize = 5;
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
    const batch = uniqueSymbols.slice(i, i + batchSize);
    
    // Buscar logos em paralelo dentro do lote
    const promises = batch.map(async (symbol) => {
      const logo = await getCryptoLogo(symbol);
      results.set(symbol, logo);
    });
    
    await Promise.all(promises);
    
    // Delay entre lotes (exceto no último)
    if (i + batchSize < uniqueSymbols.length) {
      await delay(1000); // 1 segundo entre lotes
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

