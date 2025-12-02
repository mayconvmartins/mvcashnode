import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, WebhookEventStatus, WebhookAction } from '@mvcashnode/shared';
import { WebhookParserService, ParsedSignal } from './webhook-parser.service';
import { TradeJobService } from '../trading/trade-job.service';

export interface CreateWebhookEventDto {
  webhookSourceId: number;
  targetAccountId: number;
  tradeMode: TradeMode;
  eventUid: string;
  payload: string | Record<string, unknown>;
}

export class WebhookEventService {
  constructor(
    private prisma: PrismaClient,
    private parser: WebhookParserService,
    private tradeJobService: TradeJobService
  ) {}

  async createEvent(dto: CreateWebhookEventDto): Promise<{ event: any; jobsCreated: number }> {
    // Parse signal
    const parsed = this.parser.parseSignal(dto.payload);

    // Check idempotency - using findFirst since unique constraint is composite
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

    // Create event
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
        status: WebhookEventStatus.RECEIVED,
      },
    });

    // Create jobs from event
    const jobsCreated = await this.createJobsFromEvent(event.id);

    // Update event status
    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: jobsCreated > 0 ? WebhookEventStatus.JOB_CREATED : WebhookEventStatus.SKIPPED,
        processed_at: new Date(),
      },
    });

    return { event, jobsCreated };
  }

  private async createJobsFromEvent(eventId: number): Promise<number> {
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

    if (!event || event.action === WebhookAction.UNKNOWN) {
      return 0;
    }

    let jobsCreated = 0;

    for (const binding of event.webhook_source.bindings) {
      // Match trade mode: is_simulation true = SIMULATION, false = REAL
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
          side: event.action === WebhookAction.BUY_SIGNAL ? 'BUY' : 'SELL',
          orderType: 'MARKET',
        });
        jobsCreated++;
      } catch (error) {
        // Log error but continue
        console.error(`Failed to create job for binding ${binding.id}:`, error);
      }
    }

    return jobsCreated;
  }
}

