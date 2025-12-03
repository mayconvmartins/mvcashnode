import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, WebhookEventStatus, WebhookAction, ExchangeType } from '@mvcashnode/shared';
import { WebhookParserService } from './webhook-parser.service';
import { TradeJobService } from '../trading/trade-job.service';
import { MinProfitValidationService } from '../trading/min-profit-validation.service';

export interface CreateWebhookEventDto {
  webhookSourceId: number;
  targetAccountId: number;
  tradeMode: TradeMode;
  eventUid: string;
  payload: string | Record<string, unknown>;
}

export class WebhookEventService {
  private minProfitValidationService: MinProfitValidationService;

  constructor(
    private prisma: PrismaClient,
    private parser: WebhookParserService,
    private tradeJobService: TradeJobService
  ) {
    this.minProfitValidationService = new MinProfitValidationService(prisma);
  }

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
    console.log(`[WEBHOOK-EVENT] Criando evento com priceReference: ${parsed.priceReference}`);
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

    console.log(`[WEBHOOK-EVENT] ✅ Evento criado: ID=${event.id}, price_reference=${event.price_reference ? event.price_reference.toNumber() : 'NULL'}, action=${event.action}`);

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
      price_reference: event?.price_reference ? event.price_reference.toNumber() : 'NULL',
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
          accountId: binding.exchange_account.id,
        });

        // Para BUY, verificar se existe parâmetro de trading
        if (side === 'BUY') {
          const parameter = await this.prisma.tradeParameter.findFirst({
            where: {
              exchange_account_id: binding.exchange_account.id,
              symbol: event.symbol_normalized,
              side: { in: [side, 'BOTH'] },
            },
          });

          if (!parameter) {
            console.warn(`[WEBHOOK-EVENT] ⚠️ Parâmetro de trading NÃO encontrado para:`, {
              accountId: binding.exchange_account.id,
              symbol: event.symbol_normalized,
              side,
              symbolRaw: event.symbol_raw,
            });
            console.warn(`[WEBHOOK-EVENT] Tentando buscar parâmetros existentes para esta conta...`);
            const allParams = await this.prisma.tradeParameter.findMany({
              where: {
                exchange_account_id: binding.exchange_account.id,
              },
              select: {
                id: true,
                symbol: true,
                side: true,
              },
            });
            console.warn(`[WEBHOOK-EVENT] Parâmetros existentes para conta ${binding.exchange_account.id}:`, allParams);
          } else {
            console.log(`[WEBHOOK-EVENT] ✅ Parâmetro encontrado:`, {
              id: parameter.id,
              symbol: parameter.symbol,
              side: parameter.side,
              quote_amount_fixed: parameter.quote_amount_fixed?.toNumber(),
              quote_amount_pct_balance: parameter.quote_amount_pct_balance?.toNumber(),
            });
          }
        }

        // Para SELL, buscar posição aberta e usar quantidade restante
        let baseQuantity: number | undefined = undefined;
        let limitPrice: number | undefined = undefined;
        let orderType: 'MARKET' | 'LIMIT' = 'MARKET';
        
        console.log(`[WEBHOOK-EVENT] Processando ${side} para evento ${event.id}, price_reference: ${event.price_reference ? event.price_reference.toNumber() : 'NULL'}`);
        
        if (side === 'SELL') {
          // Todas ordens de venda devem ser LIMIT
          orderType = 'LIMIT';
          console.log(`[WEBHOOK-EVENT] 🔴 VENDA DETECTADA - Definindo orderType como LIMIT`);
          
          // VALIDAÇÃO OBRIGATÓRIA: price_reference deve existir para vendas via webhook
          console.log(`[WEBHOOK-EVENT] Verificando price_reference: ${event.price_reference ? `EXISTE (${event.price_reference.toNumber()})` : 'NULL'}`);
          
          if (!event.price_reference) {
            const errorMsg = `[WEBHOOK-EVENT] ❌ ERRO CRÍTICO: price_reference é NULL para venda via webhook. Evento ${event.id}. Payload: ${event.raw_text || JSON.stringify(event.raw_payload_json)}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
          
          const priceRefValue = event.price_reference.toNumber();
          if (priceRefValue <= 0 || isNaN(priceRefValue)) {
            const errorMsg = `[WEBHOOK-EVENT] ❌ ERRO CRÍTICO: price_reference é inválido (${priceRefValue}) para venda via webhook. Evento ${event.id}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }

          limitPrice = priceRefValue;
          console.log(`[WEBHOOK-EVENT] ✅ Usando price_reference do evento: ${limitPrice} para criar ordem LIMIT`);
          
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
            const priceOpen = openPosition.price_open.toNumber();
            console.log(`[WEBHOOK-EVENT] Posição aberta encontrada: ID ${openPosition.id}, quantidade restante: ${baseQuantity}, preço abertura: ${priceOpen}`);

            // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado
            // Usa o price_reference do webhook para validar
            // Stop Loss ignora esta validação (mas vendas via webhook não são stop loss)
            console.log(`[WEBHOOK-EVENT] ========== INICIANDO VALIDAÇÃO DE LUCRO MÍNIMO ==========`);
            console.log(`[WEBHOOK-EVENT] Preço de abertura: ${priceOpen}`);
            console.log(`[WEBHOOK-EVENT] Preço de venda (limitPrice): ${limitPrice}`);
            console.log(`[WEBHOOK-EVENT] Conta: ${binding.exchange_account.id}, Símbolo: ${event.symbol_normalized}`);
            
            try {
              const validationResult = await this.minProfitValidationService.validateMinProfit(
                binding.exchange_account.id,
                event.symbol_normalized,
                priceOpen,
                'WEBHOOK',
                binding.exchange_account.exchange as ExchangeType,
                event.trade_mode as 'REAL' | 'SIMULATION',
                limitPrice // Passar price_reference para validação
              );

              console.log(`[WEBHOOK-EVENT] ========== RESULTADO DA VALIDAÇÃO ==========`);
              console.log(`[WEBHOOK-EVENT] Válido: ${validationResult.valid}`);
              console.log(`[WEBHOOK-EVENT] Motivo: ${validationResult.reason}`);
              console.log(`[WEBHOOK-EVENT] Lucro %: ${validationResult.profitPct?.toFixed(2) || 'N/A'}%`);
              console.log(`[WEBHOOK-EVENT] Lucro mínimo %: ${validationResult.minProfitPct?.toFixed(2) || 'N/A'}%`);

              if (!validationResult.valid) {
                console.warn(`[WEBHOOK-EVENT] ⚠️⚠️⚠️ VENDA VIA WEBHOOK SKIPADA: ${validationResult.reason} ⚠️⚠️⚠️`);
                // Não criar o job de venda
                continue;
              } else {
                console.log(`[WEBHOOK-EVENT] ✅✅✅ Validação de lucro mínimo PASSOU: ${validationResult.reason} ✅✅✅`);
              }
            } catch (profitCheckError: any) {
              console.error(`[WEBHOOK-EVENT] ❌ ERRO ao verificar lucro mínimo: ${profitCheckError.message}`);
              console.error(`[WEBHOOK-EVENT] Stack: ${profitCheckError.stack}`);
              // Em caso de erro, continuar com a venda (não bloquear por erro de validação)
            }
          } else {
            console.warn(`[WEBHOOK-EVENT] ⚠️ Nenhuma posição aberta encontrada para vender ${event.symbol_normalized} na conta ${binding.exchange_account.id}`);
            // Continuar mesmo sem posição - o executor vai falhar mas pelo menos o evento será registrado
          }
        }

        // VALIDAÇÃO FINAL: Garantir que vendas via webhook são sempre LIMIT
        if (side === 'SELL') {
          if (orderType !== 'LIMIT') {
            console.error(`[WEBHOOK-EVENT] ⚠️ ERRO: Venda via webhook deve ser LIMIT, mas orderType=${orderType}. Forçando LIMIT.`);
            orderType = 'LIMIT';
          }
          if (!limitPrice || limitPrice <= 0) {
            console.error(`[WEBHOOK-EVENT] ⚠️ ERRO: Venda via webhook requer limitPrice, mas limitPrice=${limitPrice}. Pulando criação do job.`);
            continue;
          }
        }
        
        console.log(`[WEBHOOK-EVENT] ========== ANTES DE CRIAR JOB ==========`);
        console.log(`[WEBHOOK-EVENT] side: ${side}`);
        console.log(`[WEBHOOK-EVENT] orderType: ${orderType} (tipo: ${typeof orderType})`);
        console.log(`[WEBHOOK-EVENT] limitPrice: ${limitPrice} (tipo: ${typeof limitPrice})`);
        console.log(`[WEBHOOK-EVENT] baseQuantity: ${baseQuantity}`);
        console.log(`[WEBHOOK-EVENT] event.price_reference: ${event.price_reference ? event.price_reference.toNumber() : 'NULL'}`);
        
        // GARANTIR que orderType é LIMIT para vendas
        if (side === 'SELL') {
          if (orderType !== 'LIMIT') {
            console.error(`[WEBHOOK-EVENT] ❌ FORÇANDO orderType para LIMIT (era ${orderType})`);
            orderType = 'LIMIT';
          }
          if (!limitPrice || limitPrice <= 0) {
            throw new Error(`[WEBHOOK-EVENT] ❌ limitPrice inválido para venda: ${limitPrice}`);
          }
        }
        
        console.log(`[WEBHOOK-EVENT] ========== CHAMANDO createJob ==========`);
        console.log(`[WEBHOOK-EVENT] Parâmetros:`, {
          side,
          orderType,
          limitPrice,
          baseQuantity,
          webhookEventId: event.id,
        });

        const tradeJob = await this.tradeJobService.createJob({
          webhookEventId: event.id,
          exchangeAccountId: binding.exchange_account.id,
          tradeMode: event.trade_mode as TradeMode,
          symbol: event.symbol_normalized,
          side,
          orderType,
          baseQuantity, // Passar quantidade para SELL
          limitPrice, // Passar preço limite para SELL
          skipParameterValidation: side === 'SELL' && baseQuantity !== undefined, // Pular validação se já temos quantidade
        });
        
        // VALIDAÇÃO PÓS-CRIAÇÃO: Verificar se foi salvo corretamente
        if (side === 'SELL' && tradeJob.order_type !== 'LIMIT') {
          console.error(`[WEBHOOK-EVENT] ⚠️ ERRO CRÍTICO: Job de venda criado como ${tradeJob.order_type} ao invés de LIMIT! ID=${tradeJob.id}`);
        }
        if (side === 'SELL' && (!tradeJob.limit_price || tradeJob.limit_price.toNumber() <= 0)) {
          console.error(`[WEBHOOK-EVENT] ⚠️ ERRO CRÍTICO: Job de venda criado sem limitPrice! ID=${tradeJob.id}`);
        }
        
        console.log(`[WEBHOOK-EVENT] ✅ Job criado: ID=${tradeJob.id}, orderType=${tradeJob.order_type}, limitPrice=${tradeJob.limit_price?.toNumber() || 'NULL'}, quantidade: ${baseQuantity || tradeJob.quote_amount || 'calculada automaticamente'}`);
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

