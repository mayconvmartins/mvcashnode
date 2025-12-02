import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { BinanceSpotAdapter } from '@mvcashnode/exchange';
import { ExchangeType } from '@mvcashnode/shared';

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

  async testConnection(accountId: number, userId: number): Promise<boolean> {
    const account = await this.domainService.getAccountById(accountId, userId);
    if (!account || account.is_simulation) {
      return false;
    }

    const keys = await this.domainService.decryptApiKeys(accountId);
    if (!keys) {
      return false;
    }

    const adapter = new BinanceSpotAdapter(
      account.exchange as ExchangeType,
      keys.apiKey,
      keys.apiSecret,
      { testnet: account.testnet }
    );

    return adapter.testConnection();
  }
}

