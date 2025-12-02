import { PrismaClient } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { TradeMode } from '@mvcashnode/shared';
export interface CreateWebhookSourceDto {
    ownerUserId: number;
    label: string;
    webhookCode: string;
    tradeMode: TradeMode;
    allowedIPs?: string[];
    requireSignature?: boolean;
    signingSecret?: string;
    rateLimitPerMin?: number;
}
export declare class WebhookSourceService {
    private prisma;
    private encryptionService;
    constructor(prisma: PrismaClient, encryptionService: EncryptionService);
    createSource(dto: CreateWebhookSourceDto): Promise<any>;
    getSourceByCode(webhookCode: string): Promise<any>;
    validateIP(webhookCode: string, ip: string): Promise<boolean>;
    validateSignature(webhookCode: string, body: string, signature: string): Promise<boolean>;
    checkRateLimit(webhookCode: string): Promise<boolean>;
}
//# sourceMappingURL=webhook-source.service.d.ts.map