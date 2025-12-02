import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { TradeParameterService } from '@mvcashnode/domain';

@Injectable()
export class TradeParametersService {
  private domainService: TradeParameterService;

  constructor(private prisma: PrismaService) {
    this.domainService = new TradeParameterService(prisma);
  }

  getDomainService(): TradeParameterService {
    return this.domainService;
  }
}

