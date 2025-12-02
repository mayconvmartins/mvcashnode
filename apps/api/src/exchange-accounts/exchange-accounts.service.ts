import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
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
}

