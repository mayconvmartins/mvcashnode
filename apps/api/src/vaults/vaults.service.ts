import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { VaultService } from '@mvcashnode/domain';

@Injectable()
export class VaultsService {
  private domainService: VaultService;

  constructor(private prisma: PrismaService) {
    this.domainService = new VaultService(prisma);
  }

  getDomainService(): VaultService {
    return this.domainService;
  }
}

