import { PrismaClient } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';
import { WebhookParserService } from './webhook-parser.service';
import { TradeJobService } from '../trading/trade-job.service';
export interface CreateWebhookEventDto {
    webhookSourceId: number;
    targetAccountId: number;
    tradeMode: TradeMode;
    eventUid: string;
    payload: string | Record<string, unknown>;
}
export declare class WebhookEventService {
    private prisma;
    private parser;
    private tradeJobService;
    constructor(prisma: PrismaClient, parser: WebhookParserService, tradeJobService: TradeJobService);
    createEvent(dto: CreateWebhookEventDto): Promise<{
        event: any;
        jobsCreated: number;
    }>;
    private createJobsFromEvent;
}
//# sourceMappingURL=webhook-event.service.d.ts.map