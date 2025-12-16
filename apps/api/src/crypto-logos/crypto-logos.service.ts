import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

// Mapeamento de símbolos para IDs do CoinGecko
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  POL: 'matic-network',
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
  GALA: 'gala',
  ENJ: 'enjincoin',
  IMX: 'immutable-x',
  BLUR: 'blur',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  FLOKI: 'floki',
  BONK: 'bonk',
  WIF: 'dogwifcoin',
  MEME: 'memecoin-2',
  WOO: 'woo-network',
  FET: 'fetch-ai',
  RENDER: 'render-token',
  RNDR: 'render-token',
  AGIX: 'singularitynet',
  OCEAN: 'ocean-protocol',
  TIA: 'celestia',
  SEI: 'sei-network',
  ORDI: 'ordinals',
  JUP: 'jupiter-exchange-solana',
  WLD: 'worldcoin-wld',
  PYTH: 'pyth-network',
  JTO: 'jito-governance-token',
  XMR: 'monero',
  ETC: 'ethereum-classic',
  BCH: 'bitcoin-cash',
  BSV: 'bitcoin-sv',
  XTZ: 'tezos',
  EOS: 'eos',
  THETA: 'theta-token',
  KAVA: 'kava',
  ZEC: 'zcash',
  DASH: 'dash',
  NEO: 'neo',
  WAVES: 'waves',
  QTUM: 'qtum',
  ONT: 'ontology',
  ZIL: 'zilliqa',
  BAT: 'basic-attention-token',
  ZRX: '0x',
  COMP: 'compound-governance-token',
  YFI: 'yearn-finance',
  SUSHI: 'sushi',
  BAL: 'balancer',
  KNC: 'kyber-network-crystal',
  BAND: 'band-protocol',
  RSR: 'reserve-rights-token',
  REN: 'republic-protocol',
  LRC: 'loopring',
  ENS: 'ethereum-name-service',
  '1INCH': '1inch',
  CHZ: 'chiliz',
  MINA: 'mina-protocol',
  FLOW: 'flow',
  EGLD: 'elrond-erd-2',
  KLAY: 'klay-token',
  CAKE: 'pancakeswap-token',
  ROSE: 'oasis-network',
  CELO: 'celo',
  AR: 'arweave',
  HNT: 'helium',
  XEC: 'ecash',
  GMX: 'gmx',
  DYDX: 'dydx',
  RPL: 'rocket-pool',
  FXS: 'frax-share',
  CVX: 'convex-finance',
  ANKR: 'ankr',
};

@Injectable()
export class CryptoLogosService {
  private readonly logger = new Logger(CryptoLogosService.name);
  private readonly logosDir: string;
  private readonly publicUrl: string;

  constructor(private prisma: PrismaService) {
    // Caminho para salvar logos
    this.logosDir = join(process.cwd(), 'apps', 'api', 'public', 'logos');
    this.publicUrl = process.env.API_URL || 'http://localhost:4010';
    
    // Criar diretório se não existir
    this.ensureLogosDirectory();
  }

  private async ensureLogosDirectory() {
    try {
      await fs.access(this.logosDir);
    } catch {
      await fs.mkdir(this.logosDir, { recursive: true });
      this.logger.log(`Created logos directory: ${this.logosDir}`);
    }
  }

  /**
   * Normaliza símbolo removendo USDT
   */
  private normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase().replace(/USDT$/i, '');
  }

  /**
   * Obtém ID do CoinGecko para um símbolo
   */
  private getCoinGeckoId(symbol: string): string | null {
    const normalized = this.normalizeSymbol(symbol);
    return SYMBOL_TO_COINGECKO_ID[normalized] || null;
  }

  /**
   * Busca ou cria entrada de logo para um símbolo
   */
  async getLogoUrl(symbol: string): Promise<string | null> {
    try {
      const normalized = this.normalizeSymbol(symbol);
      
      // 1. Verificar se já existe no banco
      let cryptoSymbol = await this.prisma.cryptoSymbol.findUnique({
        where: { symbol: normalized },
      });

      // 2. Se existe e tem logo local, retornar URL
      if (cryptoSymbol?.logo_local_path) {
        const fileName = cryptoSymbol.logo_local_path.split('/').pop();
        return `${this.publicUrl}/logos/${fileName}`;
      }

      // 3. Se não existe, tentar baixar do CoinGecko
      const coinGeckoId = this.getCoinGeckoId(normalized);
      if (!coinGeckoId) {
        this.logger.warn(`No CoinGecko ID found for symbol: ${normalized}`);
        return null;
      }

      // 4. Baixar e salvar logo
      const localPath = await this.downloadAndSaveLogo(normalized, coinGeckoId);
      
      if (!localPath) {
        return null;
      }

      // 5. Salvar ou atualizar no banco
      cryptoSymbol = await this.prisma.cryptoSymbol.upsert({
        where: { symbol: normalized },
        create: {
          symbol: normalized,
          coingecko_id: coinGeckoId,
          logo_local_path: localPath,
          last_updated: new Date(),
        },
        update: {
          coingecko_id: coinGeckoId,
          logo_local_path: localPath,
          last_updated: new Date(),
        },
      });

      // 6. Retornar URL pública
      const fileName = localPath.split('/').pop();
      return `${this.publicUrl}/logos/${fileName}`;
    } catch (error) {
      this.logger.error(`Error getting logo for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Busca múltiplos logos de uma vez
   */
  async getLogosForSymbols(symbols: string[]): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    
    // Processar em lotes de 5 para evitar sobrecarga
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(async (symbol) => {
        const url = await this.getLogoUrl(symbol);
        result[symbol] = url;
      });
      
      await Promise.all(promises);
      
      // Pequeno delay entre lotes
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return result;
  }

  /**
   * Baixa logo do CoinGecko e salva localmente
   */
  private async downloadAndSaveLogo(symbol: string, coinGeckoId: string): Promise<string | null> {
    try {
      // 1. Buscar informações do CoinGecko
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinGeckoId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
        {
          headers: { 'Accept': 'application/json' },
        }
      );

      if (!response.ok) {
        this.logger.error(`CoinGecko API error for ${symbol}: ${response.status}`);
        return null;
      }

    const data = await response.json() as any;
    const logoUrl = (data?.image?.small || data?.image?.thumb || data?.image?.large) as string | undefined;

      if (!logoUrl) {
        this.logger.warn(`No logo URL found for ${symbol}`);
        return null;
      }

      // 2. Baixar imagem
      const imageResponse = await fetch(logoUrl);
      if (!imageResponse.ok) {
        this.logger.error(`Failed to download logo for ${symbol}`);
        return null;
      }

      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      
      // 3. Gerar nome de arquivo único (usar hash para evitar colisões)
      const hash = crypto.createHash('md5').update(symbol).digest('hex').substring(0, 8);
      const extension = logoUrl.split('.').pop()?.split('?')[0] || 'png';
      const fileName = `${symbol.toLowerCase()}_${hash}.${extension}`;
      const filePath = join(this.logosDir, fileName);

      // 4. Salvar arquivo
      await fs.writeFile(filePath, buffer);
      this.logger.log(`Logo saved for ${symbol}: ${fileName}`);

      return `/logos/${fileName}`;
    } catch (error) {
      this.logger.error(`Error downloading logo for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Força atualização de um logo
   */
  async refreshLogo(symbol: string): Promise<string | null> {
    try {
      const normalized = this.normalizeSymbol(symbol);
      
      // Deletar entrada antiga se existir
      await this.prisma.cryptoSymbol.deleteMany({
        where: { symbol: normalized },
      });

      // Buscar novamente
      return await this.getLogoUrl(symbol);
    } catch (error) {
      this.logger.error(`Error refreshing logo for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Limpa logos antigos (mais de 30 dias sem update)
   */
  async cleanupOldLogos(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const oldSymbols = await this.prisma.cryptoSymbol.findMany({
        where: {
          last_updated: {
            lt: thirtyDaysAgo,
          },
        },
      });

      for (const symbol of oldSymbols) {
        if (symbol.logo_local_path) {
          const fileName = symbol.logo_local_path.split('/').pop();
          if (fileName) {
            const filePath = join(this.logosDir, fileName);
            try {
              await fs.unlink(filePath);
              this.logger.log(`Deleted old logo: ${fileName}`);
            } catch (error) {
              // Arquivo pode já não existir
            }
          }
        }
      }

      // Deletar do banco
      await this.prisma.cryptoSymbol.deleteMany({
        where: {
          last_updated: {
            lt: thirtyDaysAgo,
          },
        },
      });

      this.logger.log(`Cleaned up ${oldSymbols.length} old logos`);
    } catch (error) {
      this.logger.error('Error cleaning up old logos:', error);
    }
  }
}

