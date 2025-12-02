import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, WebhookEventStatus, WebhookAction } from '@mvcashnode/shared';
import { WebhookParserService } from './webhook-parser.service';
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

  async createEvent(dto: CreateWebhookEventDto): Promise<{ event: any; jobsCreated: number; jobIds: number[] }> {
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
      return { event: existing, jobsCreated: 0, jobIds: [] };
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
    const { count: jobsCreated, jobIds } = await this.createJobsFromEvent(event.id);

    // Update event status
    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: jobsCreated > 0 ? WebhookEventStatus.JOB_CREATED : WebhookEventStatus.SKIPPED,
        processed_at: new Date(),
      },
    });

    return { event, jobsCreated, jobIds };
  }

  private async createJobsFromEvent(eventId: number): Promise<{ count: number; jobIds: number[] }> {
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

    console.log(`[WEBHOOK-EVENT] Criando jobs para evento ${eventId}`);
    console.log(`[WEBHOOK-EVENT] Evento:`, {
      id: event?.id,
      action: event?.action,
      symbol_normalized: event?.symbol_normalized,
      trade_mode: event?.trade_mode,
      bindings_count: event?.webhook_source?.bindings?.length || 0,
    });

    if (!event) {
      console.error(`[WEBHOOK-EVENT] Evento ${eventId} não encontrado`);
      return { count: 0, jobIds: [] };
    }

    if (event.action === WebhookAction.UNKNOWN) {
      console.warn(`[WEBHOOK-EVENT] Ação desconhecida para evento ${eventId}. Payload:`, event.raw_text || event.raw_payload_json);
      return { count: 0, jobIds: [] };
    }

    let jobsCreated = 0;
    const jobIds: number[] = [];

    if (!event.webhook_source?.bindings || event.webhook_source.bindings.length === 0) {
      console.warn(`[WEBHOOK-EVENT] Nenhum binding ativo encontrado para webhook source ${event.webhook_source_id}`);
      return { count: 0, jobIds: [] };
    }

    for (const binding of event.webhook_source.bindings) {
      console.log(`[WEBHOOK-EVENT] Processando binding ${binding.id} para account ${binding.exchange_account_id}`);
      
      // Match trade mode: is_simulation true = SIMULATION, false = REAL
      const accountIsSim = binding.exchange_account.is_simulation;
      const eventIsSim = event.trade_mode === 'SIMULATION';
      
      console.log(`[WEBHOOK-EVENT] Trade mode check: account_is_sim=${accountIsSim}, event_is_sim=${eventIsSim}`);
      
      if (accountIsSim !== eventIsSim) {
        console.log(`[WEBHOOK-EVENT] Trade mode não corresponde, pulando binding ${binding.id}`);
        continue;
      }

      try {
        const side = event.action === WebhookAction.BUY_SIGNAL ? 'BUY' : 'SELL';
        
        console.log(`[WEBHOOK-EVENT] Criando job para binding ${binding.id}:`, {
          symbol: event.symbol_normalized,
          side,
          tradeMode: event.trade_mode,
        });

        // Para SELL, buscar posição aberta e usar quantidade restante
        let baseQuantity: number | undefined = undefined;
        if (side === 'SELL') {
          const openPosition = await this.prisma.tradePosition.findFirst({
            where: {
              exchange_account_id: binding.exchange_account.id,
              symbol: event.symbol_normalized,
              trade_mode: event.trade_mode,
              status: 'OPEN',
              lock_sell_by_webhook: false, // Não vender se estiver bloqueado
            },
            orderBy: {
              created_at: 'asc', // FIFO - vender a posição mais antiga primeiro
            },
          });

          if (openPosition) {
            baseQuantity = openPosition.qty_remaining.toNumber();
            console.log(`[WEBHOOK-EVENT] Posição aberta encontrada: ID ${openPosition.id}, quantidade restante: ${baseQuantity}`);
          } else {
            console.warn(`[WEBHOOK-EVENT] Nenhuma posição aberta encontrada para vender ${event.symbol_normalized} na conta ${binding.exchange_account.id}`);
            // Continuar mesmo sem posição - o executor vai falhar mas pelo menos o evento será registrado
          }
        }

        const tradeJob = await this.tradeJobService.createJob({
          webhookEventId: event.id,
          exchangeAccountId: binding.exchange_account.id,
          tradeMode: event.trade_mode as TradeMode,
          symbol: event.symbol_normalized,
          side,
          orderType: 'MARKET',
          baseQuantity, // Passar quantidade para SELL
          skipParameterValidation: side === 'SELL' && baseQuantity !== undefined, // Pular validação se já temos quantidade
        });
        
        console.log(`[WEBHOOK-EVENT] Job criado com sucesso: ${tradeJob.id}, quantidade: ${baseQuantity || 'calculada automaticamente'}`);
        jobsCreated++;
        jobIds.push(tradeJob.id);
      } catch (error: any) {
        // Log error but continue
        console.error(`[WEBHOOK-EVENT] Erro ao criar job para binding ${binding.id}:`, error?.message || error);
        console.error(`[WEBHOOK-EVENT] Stack:`, error?.stack);
      }
    }

    console.log(`[WEBHOOK-EVENT] Total de jobs criados: ${jobsCreated} de ${event.webhook_source.bindings.length} bindings`);
    return { count: jobsCreated, jobIds };
  }
}

