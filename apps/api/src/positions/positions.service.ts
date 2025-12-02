import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';

@Injectable()
export class PositionsService {
  private domainService: PositionService;

  constructor(private prisma: PrismaService) {
    this.domainService = new PositionService(prisma);
  }

  getDomainService(): PositionService {
    return this.domainService;
  }
}

