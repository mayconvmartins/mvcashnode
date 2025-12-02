import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { TradeJobService, TradeExecutionService } from '@mvcashnode/domain';

@Injectable()
export class TradeJobsService {
  private domainJobService: TradeJobService;
  private domainExecutionService: TradeExecutionService;

  constructor(private prisma: PrismaService) {
    this.domainJobService = new TradeJobService(prisma);
    this.domainExecutionService = new TradeExecutionService(prisma);
  }

  getDomainJobService(): TradeJobService {
    return this.domainJobService;
  }

  getDomainExecutionService(): TradeExecutionService {
    return this.domainExecutionService;
  }
}

