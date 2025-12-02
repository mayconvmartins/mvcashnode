"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookEventService = void 0;
const shared_1 = require("@mvcashnode/shared");
class WebhookEventService {
    prisma;
    parser;
    tradeJobService;
    constructor(prisma, parser, tradeJobService) {
        this.prisma = prisma;
        this.parser = parser;
        this.tradeJobService = tradeJobService;
    }
    async createEvent(dto) {
        const parsed = this.parser.parseSignal(dto.payload);
        const existing = await this.prisma.webhookEvent.findFirst({
            where: {
                webhook_source_id: dto.webhookSourceId,
                target_account_id: dto.targetAccountId,
                event_uid: dto.eventUid,
            },
        });
        if (existing) {
            return { event: existing, jobsCreated: 0 };
        }
        const event = await this.prisma.webhookEvent.create({
            data: {
                webhook_source_id: dto.webhookSourceId,
                target_account_id: dto.targetAccountId,
                trade_mode: dto.tradeMode,
                event_uid: dto.eventUid,
                symbol_raw: parsed.symbolRaw,
                symbol_normalized: parsed.symbolNormalized,
                action: parsed.action,
                timeframe: parsed.timeframe || null,
                price_reference: parsed.priceReference || null,
                raw_text: typeof dto.payload === 'string' ? dto.payload : null,
                raw_payload_json: typeof dto.payload === 'object' ? JSON.parse(JSON.stringify(dto.payload)) : null,
                status: shared_1.WebhookEventStatus.RECEIVED,
            },
        });
        const jobsCreated = await this.createJobsFromEvent(event.id);
        await this.prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
                status: jobsCreated > 0 ? shared_1.WebhookEventStatus.JOB_CREATED : shared_1.WebhookEventStatus.SKIPPED,
                processed_at: new Date(),
            },
        });
        return { event, jobsCreated };
    }
    async createJobsFromEvent(eventId) {
        const event = await this.prisma.webhookEvent.findUnique({
            where: { id: eventId },
            include: {
                webhook_source: {
                    include: {
                        bindings: {
                            where: { is_active: true },
                            include: {
                                exchange_account: {
                                    include: {
                                        user: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!event || event.action === shared_1.WebhookAction.UNKNOWN) {
            return 0;
        }
        let jobsCreated = 0;
        for (const binding of event.webhook_source.bindings) {
            const accountIsSim = binding.exchange_account.is_simulation;
            const eventIsSim = event.trade_mode === 'SIMULATION';
            if (accountIsSim !== eventIsSim) {
                continue;
            }
            try {
                await this.tradeJobService.createJob({
                    webhookEventId: event.id,
                    exchangeAccountId: binding.exchange_account.id,
                    tradeMode: event.trade_mode,
                    symbol: event.symbol_normalized,
                    side: event.action === shared_1.WebhookAction.BUY_SIGNAL ? 'BUY' : 'SELL',
                    orderType: 'MARKET',
                });
                jobsCreated++;
            }
            catch (error) {
                console.error(`Failed to create job for binding ${binding.id}:`, error);
            }
        }
        return jobsCreated;
    }
}
exports.WebhookEventService = WebhookEventService;
//# sourceMappingURL=webhook-event.service.js.map