import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import {
  WebhookParserService,
  WebhookSourceService,
  WebhookEventService,
  TradeJobService,
} from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';

@Injectable()
export class WebhooksService {
  private parserService: WebhookParserService;
  private sourceService: WebhookSourceService;
  private eventService: WebhookEventService;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    this.parserService = new WebhookParserService();
    this.sourceService = new WebhookSourceService(prisma, encryptionService);
    const tradeJobService = new TradeJobService(prisma);
    this.eventService = new WebhookEventService(
      prisma,
      this.parserService,
      tradeJobService
    );
  }

  getParserService(): WebhookParserService {
    return this.parserService;
  }

  getSourceService(): WebhookSourceService {
    return this.sourceService;
  }

  getEventService(): WebhookEventService {
    return this.eventService;
  }
}

