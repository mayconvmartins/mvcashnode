import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService, TradeMode } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType } from '@mvcashnode/shared';

export interface TestConnectionResult {
  success: boolean;
  message?: string;
  error?: string;
}

@Injectable()
export class ExchangeAccountsService {
  private domainService: ExchangeAccountService;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    this.domainService = new ExchangeAccountService(prisma, encryptionService);
  }

  getDomainService(): ExchangeAccountService {
    return this.domainService;
  }

  async testConnection(accountId: number, userId: number): Promise<TestConnectionResult> {
    try {
      const account = await this.domainService.getAccountById(accountId, userId);
      
      if (!account) {
        return {
          success: false,
          message: 'Account not found',
          error: 'Exchange account does not exist or you do not have permission to access it'
        };
      }

      if (account.is_simulation) {
        return {
          success: true,
          message: 'Simulation account - no real connection test needed',
        };
      }

      const keys = await this.domainService.decryptApiKeys(accountId);
      if (!keys || !keys.apiKey || !keys.apiSecret) {
        return {
          success: false,
          message: 'Missing credentials',
          error: 'API Key or Secret not configured for this account'
        };
      }

      // Usar factory para criar o adapter correto baseado no tipo de exchange
      const adapter = AdapterFactory.createAdapter(
        account.exchange as ExchangeType,
        keys.apiKey,
        keys.apiSecret,
        { testnet: account.testnet }
      );

      return await adapter.testConnection();
    } catch (error: any) {
      console.error('[ExchangeAccountsService] Test connection error:', error);
      return {
        success: false,
        message: 'Unexpected error',
        error: error.message || 'An unexpected error occurred while testing connection'
      };
    }
  }

  async getBalances(accountId: number, userId: number): Promise<any> {
    try {
      const account = await this.domainService.getAccountById(accountId, userId);
      
      if (!account) {
        throw new Error('Exchange account not found');
      }

      const tradeMode = account.is_simulation ? TradeMode.SIMULATION : TradeMode.REAL;

      // Buscar saldos do cache
      const balancesCache = await this.prisma.accountBalanceCache.findMany({
        where: {
          exchange_account_id: accountId,
          trade_mode: tradeMode,
        },
        orderBy: {
          asset: 'asc',
        },
      });

      // Converter para formato esperado pelo frontend
      const balances: Record<string, { free: number; locked: number; lastSync?: string }> = {};
      
      for (const cache of balancesCache) {
        balances[cache.asset] = {
          free: cache.free.toNumber(),
          locked: cache.locked.toNumber(),
          lastSync: cache.last_sync_at?.toISOString(),
        };
      }

      // Se for conta de simulação e não houver cache, retornar saldos iniciais
      if (account.is_simulation && Object.keys(balances).length === 0) {
        const initialBalances = account.initial_balances_json as Record<string, number> || {};
        for (const [asset, amount] of Object.entries(initialBalances)) {
          balances[asset] = {
            free: amount,
            locked: 0,
          };
        }
      }

      return {
        success: true,
        balances,
        lastSync: balancesCache.length > 0 
          ? balancesCache[0].last_sync_at?.toISOString() 
          : null,
      };
    } catch (error: any) {
      console.error('[ExchangeAccountsService] Get balances error:', error);
      throw new Error(`Failed to get balances: ${error.message}`);
    }
  }

  async syncBalances(accountId: number, userId: number): Promise<any> {
    try {
      const account = await this.domainService.getAccountById(accountId, userId);
      
      if (!account) {
        throw new Error('Exchange account not found');
      }

      if (account.is_simulation) {
        // Para contas de simulação, retorna saldos iniciais
        return {
          success: true,
          message: 'Simulation account - using initial balances',
          balances: account.initial_balances_json || {}
        };
      }

      const keys = await this.domainService.decryptApiKeys(accountId);
      if (!keys) {
        throw new Error('Missing API credentials');
      }

      // Criar adapter
      const adapter = AdapterFactory.createAdapter(
        account.exchange as ExchangeType,
        keys.apiKey,
        keys.apiSecret,
        { testnet: account.testnet }
      );

      // Buscar saldos
      const balance = await adapter.fetchBalance();

      // Converter para formato do domain
      const balances: Record<string, { free: number; locked: number }> = {};
      for (const [asset, amount] of Object.entries(balance.free || {})) {
        balances[asset] = {
          free: amount,
          locked: balance.used?.[asset] || 0,
        };
      }

      // Sincronizar no banco
      const tradeMode = account.is_simulation ? TradeMode.SIMULATION : TradeMode.REAL;

      // ✅ CORREÇÃO: Remover ativos que não existem mais na exchange (saldo zerado)
      // A Binance não retorna ativos com saldo 0, então precisamos deletar do cache
      const existingCache = await this.prisma.accountBalanceCache.findMany({
        where: { exchange_account_id: accountId, trade_mode: tradeMode },
        select: { asset: true },
      });

      const assetsFromExchange = new Set(Object.keys(balances));
      const assetsToDelete = existingCache
        .filter(c => !assetsFromExchange.has(c.asset))
        .map(c => c.asset);

      if (assetsToDelete.length > 0) {
        await this.prisma.accountBalanceCache.deleteMany({
          where: {
            exchange_account_id: accountId,
            trade_mode: tradeMode,
            asset: { in: assetsToDelete },
          },
        });
        console.log(`[ExchangeAccountsService] Removidos ${assetsToDelete.length} ativos zerados do cache: ${assetsToDelete.join(', ')}`);
      }

      await this.domainService.syncBalance(accountId, tradeMode, balances);

      return {
        success: true,
        message: 'Balances synced successfully',
        balances
      };
    } catch (error: any) {
      console.error('[ExchangeAccountsService] Sync balances error:', error);
      throw new Error(`Failed to sync balances: ${error.message}`);
    }
  }

  async syncPositions(accountId: number, userId: number): Promise<any> {
    try {
      const account = await this.domainService.getAccountById(accountId, userId);
      
      if (!account) {
        throw new Error('Exchange account not found');
      }

      if (account.is_simulation) {
        // Para contas de simulação, busca posições do banco apenas
        const positions = await this.prisma.tradePosition.count({
          where: {
            exchange_account_id: accountId,
            status: 'OPEN'
          }
        });

        return {
          success: true,
          message: 'Simulation account - positions from database',
          positionsFound: positions
        };
      }

      const keys = await this.domainService.decryptApiKeys(accountId);
      if (!keys) {
        throw new Error('Missing API credentials');
      }

      // Criar adapter
      const adapter = AdapterFactory.createAdapter(
        account.exchange as ExchangeType,
        keys.apiKey,
        keys.apiSecret,
        { testnet: account.testnet }
      );

      // Buscar posições abertas (apenas para exchanges que suportam)
      // Para spot, contamos as posições no banco que têm quantidade > 0
      const openPositions = await this.prisma.tradePosition.findMany({
        where: {
          exchange_account_id: accountId,
          status: 'OPEN'
        }
      });

      return {
        success: true,
        message: 'Positions synced successfully',
        positionsFound: openPositions.length
      };
    } catch (error: any) {
      console.error('[ExchangeAccountsService] Sync positions error:', error);
      throw new Error(`Failed to sync positions: ${error.message}`);
    }
  }
}

