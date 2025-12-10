import { PrismaClient } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';
import { TradeJobService } from '../trading/trade-job.service';

export enum WebhookMonitorAlertState {
  MONITORING = 'MONITORING',
  EXECUTED = 'EXECUTED',
  CANCELLED = 'CANCELLED',
}

export enum PriceTrend {
  FALLING = 'FALLING', // Ainda caindo
  LATERAL = 'LATERAL', // Lateralizando
  RISING = 'RISING', // Iniciando alta
}

export interface WebhookMonitorConfig {
  monitor_enabled: boolean;
  check_interval_sec: number;
  // BUY
  lateral_tolerance_pct: number;
  lateral_cycles_min: number;
  rise_trigger_pct: number;
  rise_cycles_min: number;
  max_fall_pct: number;
  max_monitoring_time_min: number;
  cooldown_after_execution_min: number;
  // SELL
  sell_lateral_tolerance_pct: number;
  sell_lateral_cycles_min: number;
  sell_fall_trigger_pct: number;
  sell_fall_cycles_min: number;
  sell_max_rise_pct: number;
  sell_max_monitoring_time_min: number;
  sell_cooldown_after_execution_min: number;
}

export interface CreateOrUpdateAlertDto {
  webhookEventId: number;
  webhookSourceId: number;
  exchangeAccountId: number | null; // Opcional: mantido apenas para referência
  symbol: string;
  tradeMode: TradeMode;
  side: 'BUY' | 'SELL';
  priceAlert: number;
}

export class WebhookMonitorService {
  private readonly defaultConfig: WebhookMonitorConfig = {
    monitor_enabled: true,
    check_interval_sec: 30,
    // BUY
    lateral_tolerance_pct: 0.3,
    lateral_cycles_min: 4,
    rise_trigger_pct: 0.75,
    rise_cycles_min: 2,
    max_fall_pct: 6.0,
    max_monitoring_time_min: 60,
    cooldown_after_execution_min: 30,
    // SELL
    sell_lateral_tolerance_pct: 0.3,
    sell_lateral_cycles_min: 4,
    sell_fall_trigger_pct: 0.5,
    sell_fall_cycles_min: 2,
    sell_max_rise_pct: 6.0,
    sell_max_monitoring_time_min: 60,
    sell_cooldown_after_execution_min: 30,
  };

  constructor(
    private prisma: PrismaClient,
    private tradeJobService: TradeJobService
  ) {}

  /**
   * Obter configuração de monitoramento (global ou por usuário)
   */
  async getConfig(userId?: number): Promise<WebhookMonitorConfig> {
    if (userId) {
      const userConfig = await this.prisma.webhookMonitorConfig.findUnique({
        where: { user_id: userId },
      });

      if (userConfig) {
        // ✅ BUG-MED-003 FIX: Usar função helper para converter sem `as any`
        return this.convertPrismaConfigToInterface(userConfig);
      }
    }

    // Buscar configuração global (user_id = null)
    const globalConfig = await this.prisma.webhookMonitorConfig.findFirst({
      where: { user_id: null },
    });

    if (globalConfig) {
      // ✅ BUG-MED-003 FIX: Usar função helper para converter sem `as any`
      return this.convertPrismaConfigToInterface(globalConfig);
    }

    return this.defaultConfig;
  }

  /**
   * Helper para converter config do Prisma para interface
   */
  private convertPrismaConfigToInterface(config: any): WebhookMonitorConfig {
    return {
      monitor_enabled: config.monitor_enabled,
      check_interval_sec: config.check_interval_sec,
      lateral_tolerance_pct: config.lateral_tolerance_pct?.toNumber() || 0.3,
      lateral_cycles_min: config.lateral_cycles_min,
      rise_trigger_pct: config.rise_trigger_pct?.toNumber() || 0.75,
      rise_cycles_min: config.rise_cycles_min,
      max_fall_pct: config.max_fall_pct?.toNumber() || 6.0,
      max_monitoring_time_min: config.max_monitoring_time_min,
      cooldown_after_execution_min: config.cooldown_after_execution_min,
      sell_lateral_tolerance_pct: config.sell_lateral_tolerance_pct?.toNumber() || 0.3,
      sell_lateral_cycles_min: config.sell_lateral_cycles_min,
      sell_fall_trigger_pct: config.sell_fall_trigger_pct?.toNumber() || 0.5,
      sell_fall_cycles_min: config.sell_fall_cycles_min,
      sell_max_rise_pct: config.sell_max_rise_pct?.toNumber() || 6.0,
      sell_max_monitoring_time_min: config.sell_max_monitoring_time_min,
      sell_cooldown_after_execution_min: config.sell_cooldown_after_execution_min,
    };
  }

  /**
   * Obter resumo de métricas do monitor
   */
  async getSummary(): Promise<{
    monitoring_count: number;
    executed_30d: number;
    avg_savings_pct: number;
    avg_efficiency_pct: number;
    avg_monitoring_time_minutes: number;
    best_result: { symbol: string; savings_pct: number } | null;
    worst_result: { symbol: string; savings_pct: number } | null;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Contar alertas em monitoramento
    const monitoringCount = await this.prisma.webhookMonitorAlert.count({
      where: { state: 'MONITORING' },
    });

    // Buscar alertas executados nos últimos 30 dias
    // Verificar se os campos existem antes de tentar buscar
    let executed: any[] = [];
    try {
      // Tentar buscar com todos os campos primeiro
      executed = await this.prisma.webhookMonitorAlert.findMany({
        where: {
          state: 'EXECUTED',
          updated_at: { gte: thirtyDaysAgo },
        },
        select: {
          symbol: true,
          savings_pct: true,
          efficiency_pct: true,
          monitoring_duration_minutes: true,
        },
      });
    } catch (error: any) {
      // Se os campos não existem (erro de coluna não encontrada), buscar sem eles
      if (error.message?.includes('Unknown column') || error.message?.includes('does not exist')) {
        console.warn('[WEBHOOK-MONITOR] Campos de métricas não encontrados no banco, buscando sem eles. Execute a migration para adicionar os campos.');
        executed = await this.prisma.webhookMonitorAlert.findMany({
          where: {
            state: 'EXECUTED',
            updated_at: { gte: thirtyDaysAgo },
          },
          select: {
            symbol: true,
          },
        });
      } else {
        // Se for outro erro, relançar
        throw error;
      }
    }

    // Calcular médias com proteção para campos que podem não existir
    const avgSavings = executed.length > 0
      ? executed.reduce((sum, a) => {
          try {
            return sum + (a.savings_pct?.toNumber ? a.savings_pct.toNumber() : (a.savings_pct || 0));
          } catch {
            return sum + 0;
          }
        }, 0) / executed.length
      : 0;
    
    const avgEfficiency = executed.length > 0
      ? executed.reduce((sum, a) => {
          try {
            return sum + (a.efficiency_pct?.toNumber ? a.efficiency_pct.toNumber() : (a.efficiency_pct || 0));
          } catch {
            return sum + 0;
          }
        }, 0) / executed.length
      : 0;
    
    const avgMonitoringTime = executed.length > 0
      ? executed.reduce((sum, a) => sum + (a.monitoring_duration_minutes || 0), 0) / executed.length
      : 0;

    // Melhor e pior resultado com proteção
    const sortedBySavings = [...executed].sort((a, b) => {
      try {
        const aVal = a.savings_pct?.toNumber ? a.savings_pct.toNumber() : (a.savings_pct || 0);
        const bVal = b.savings_pct?.toNumber ? b.savings_pct.toNumber() : (b.savings_pct || 0);
        return bVal - aVal;
      } catch {
        return 0;
      }
    });

    return {
      monitoring_count: monitoringCount,
      executed_30d: executed.length,
      avg_savings_pct: avgSavings,
      avg_efficiency_pct: avgEfficiency,
      avg_monitoring_time_minutes: avgMonitoringTime,
      best_result: sortedBySavings[0] && sortedBySavings[0].symbol
        ? { 
            symbol: sortedBySavings[0].symbol, 
            savings_pct: sortedBySavings[0].savings_pct?.toNumber 
              ? sortedBySavings[0].savings_pct.toNumber() 
              : (sortedBySavings[0].savings_pct || 0)
          }
        : null,
      worst_result: sortedBySavings.length > 0 && sortedBySavings[sortedBySavings.length - 1]?.symbol
        ? { 
            symbol: sortedBySavings[sortedBySavings.length - 1].symbol, 
            savings_pct: sortedBySavings[sortedBySavings.length - 1].savings_pct?.toNumber
              ? sortedBySavings[sortedBySavings.length - 1].savings_pct.toNumber()
              : (sortedBySavings[sortedBySavings.length - 1].savings_pct || 0)
          }
        : null,
    };
  }

  /**
   * Criar ou atualizar alerta ativo
   * Se já existe alerta MONITORING para o mesmo webhook + símbolo + trade_mode, substitui se o novo preço for menor ou igual
   * Usa transação com lock para evitar race conditions
   */
  async createOrUpdateAlert(dto: CreateOrUpdateAlertDto): Promise<any> {
    // Usar transação para garantir atomicidade e evitar race conditions
    return await this.prisma.$transaction(
      async (tx) => {
        // Buscar alerta ativo existente (MONITORING) para o mesmo webhook + símbolo + trade_mode
        // Dentro da transação, isso garante que apenas um processo pode modificar por vez
        const existingAlert = await tx.webhookMonitorAlert.findFirst({
          where: {
            webhook_source_id: dto.webhookSourceId,
            symbol: dto.symbol,
            trade_mode: dto.tradeMode,
            state: WebhookMonitorAlertState.MONITORING,
          },
          // Ordenar por created_at para pegar o mais recente em caso de duplicatas
          orderBy: {
            created_at: 'desc',
          },
        });

        if (existingAlert) {
          const existingSide = (existingAlert as any).side || 'BUY';
          
          // Verificar se o side corresponde
          if (existingSide !== dto.side) {
            console.log(`[WEBHOOK-MONITOR] Side diferente (existente: ${existingSide}, novo: ${dto.side}), ignorando`);
            return existingAlert;
          }

          if (dto.side === 'BUY') {
            const existingMinPrice = existingAlert.price_minimum?.toNumber() || existingAlert.price_alert.toNumber();
            
            // Para BUY: substituir se novo preço é menor ou igual
            if (dto.priceAlert <= existingMinPrice) {
              console.log(`[WEBHOOK-MONITOR] Substituindo alerta BUY existente (preço antigo: ${existingMinPrice}, novo: ${dto.priceAlert})`);
              
              await tx.webhookMonitorAlert.update({
                where: { id: existingAlert.id },
                data: {
                  state: WebhookMonitorAlertState.CANCELLED,
                  cancel_reason: `Substituído por alerta ${dto.priceAlert < existingMinPrice ? 'mais barato' : 'mais recente'} (${dto.priceAlert} ${dto.priceAlert < existingMinPrice ? '<' : '='} ${existingMinPrice})`,
                  exit_reason: 'REPLACED',
                },
              });

              // Atualizar webhook_event para REPLACED
              if (existingAlert.webhook_event_id) {
                await tx.webhookEvent.update({
                  where: { id: existingAlert.webhook_event_id },
                  data: { status: 'REPLACED' },
                });
              }

              return await this.createNewAlertInTransaction(tx, dto);
            } else {
              console.log(`[WEBHOOK-MONITOR] Ignorando alerta BUY mais caro (existente: ${existingMinPrice}, novo: ${dto.priceAlert})`);
              return existingAlert;
            }
          } else {
            // SELL: substituir se novo preço é maior ou igual
            const existingMaxPrice = existingAlert.price_maximum?.toNumber() || existingAlert.price_alert.toNumber();
            
            if (dto.priceAlert >= existingMaxPrice) {
              console.log(`[WEBHOOK-MONITOR] Substituindo alerta SELL existente (preço antigo: ${existingMaxPrice}, novo: ${dto.priceAlert})`);
              
              await tx.webhookMonitorAlert.update({
                where: { id: existingAlert.id },
                data: {
                  state: WebhookMonitorAlertState.CANCELLED,
                  cancel_reason: `Substituído por alerta ${dto.priceAlert > existingMaxPrice ? 'mais alto' : 'mais recente'} (${dto.priceAlert} ${dto.priceAlert > existingMaxPrice ? '>' : '='} ${existingMaxPrice})`,
                  exit_reason: 'REPLACED',
                },
              });

              // Atualizar webhook_event para REPLACED
              if (existingAlert.webhook_event_id) {
                await tx.webhookEvent.update({
                  where: { id: existingAlert.webhook_event_id },
                  data: { status: 'REPLACED' },
                });
              }

              return await this.createNewAlertInTransaction(tx, dto);
            } else {
              console.log(`[WEBHOOK-MONITOR] Ignorando alerta SELL mais baixo (existente: ${existingMaxPrice}, novo: ${dto.priceAlert})`);
              return existingAlert;
            }
          }
        }

        // Verificar cooldown dentro da transação (por webhook + símbolo + trade_mode + side)
        const cooldownConfig = await this.getConfig();
        const cooldownMinutes = dto.side === 'SELL' 
          ? cooldownConfig.sell_cooldown_after_execution_min 
          : cooldownConfig.cooldown_after_execution_min;
        
        const cooldownMinutesAgo = new Date();
        cooldownMinutesAgo.setMinutes(
          cooldownMinutesAgo.getMinutes() - cooldownMinutes
        );

        const recentExecution = await tx.webhookMonitorAlert.findFirst({
          where: {
            webhook_source_id: dto.webhookSourceId,
            symbol: dto.symbol,
            trade_mode: dto.tradeMode,
            side: dto.side,
            state: WebhookMonitorAlertState.EXECUTED,
            updated_at: { gte: cooldownMinutesAgo },
          },
        });

        if (recentExecution) {
          console.log(`[WEBHOOK-MONITOR] Cooldown ativo para ${dto.symbol} (${dto.side}), ignorando novo alerta`);
          throw new Error(`Cooldown ativo para ${dto.symbol} (${dto.side}). Aguarde ${cooldownMinutes} minutos após execução.`);
        }

        // Criar novo alerta dentro da transação
        return await this.createNewAlertInTransaction(tx, dto);
      },
      {
        isolationLevel: 'Serializable', // Nível mais alto de isolamento para evitar race conditions
        timeout: 10000, // 10 segundos de timeout
      }
    );
  }

  /**
   * Criar novo alerta (versão para uso dentro de transação)
   */
  private async createNewAlertInTransaction(tx: any, dto: CreateOrUpdateAlertDto): Promise<any> {
    const isBuy = dto.side === 'BUY';
    
    const alert = await tx.webhookMonitorAlert.create({
      data: {
        webhook_source: {
          connect: { id: dto.webhookSourceId },
        },
        webhook_event: {
          connect: { id: dto.webhookEventId },
        },
        ...(dto.exchangeAccountId && {
          exchange_account: {
            connect: { id: dto.exchangeAccountId },
          },
        }),
        symbol: dto.symbol,
        trade_mode: dto.tradeMode,
        side: dto.side,
        price_alert: dto.priceAlert,
        price_minimum: isBuy ? dto.priceAlert : null, // BUY usa price_minimum
        price_maximum: !isBuy ? dto.priceAlert : null, // SELL usa price_maximum
        current_price: dto.priceAlert,
        state: WebhookMonitorAlertState.MONITORING,
        monitoring_status: isBuy ? PriceTrend.FALLING : PriceTrend.RISING, // BUY inicia FALLING, SELL inicia RISING
        cycles_without_new_low: 0, // Sempre 0 (BUY usa, SELL não usa mas campo é obrigatório)
        cycles_without_new_high: 0, // Sempre 0 (SELL usa, BUY não usa mas campo é obrigatório)
        last_price_check_at: new Date(),
      },
    });

    console.log(`[WEBHOOK-MONITOR] ✅ Alerta ${dto.side} criado: ID=${alert.id}, símbolo=${dto.symbol}, preço=${dto.priceAlert}`);
    return alert;
  }

  /**
   * Buscar alerta ativo por webhook + símbolo + trade_mode
   */
  async getActiveAlert(
    webhookSourceId: number,
    symbol: string,
    tradeMode: TradeMode
  ): Promise<any | null> {
    return this.prisma.webhookMonitorAlert.findFirst({
      where: {
        webhook_source_id: webhookSourceId,
        symbol,
        trade_mode: tradeMode,
        state: WebhookMonitorAlertState.MONITORING,
      },
    });
  }

  /**
   * Atualizar monitoramento de preço
   * Chama a lógica correta baseado no side (BUY ou SELL)
   */
  async updatePriceMonitoring(alertId: number, currentPrice: number): Promise<{
    alert: any;
    trend: PriceTrend;
    shouldExecute: boolean;
    shouldCancel: boolean;
    cancelReason?: string;
  }> {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert || alert.state !== WebhookMonitorAlertState.MONITORING) {
      throw new Error(`Alerta ${alertId} não encontrado ou não está em MONITORING`);
    }

    const side = (alert as any).side || 'BUY';
    
    if (side === 'SELL') {
      return this.updatePriceMonitoringSELL(alertId, currentPrice);
    } else {
      return this.updatePriceMonitoringBUY(alertId, currentPrice);
    }
  }

  /**
   * Atualizar monitoramento de preço para BUY
   */
  private async updatePriceMonitoringBUY(alertId: number, currentPrice: number): Promise<{
    alert: any;
    trend: PriceTrend;
    shouldExecute: boolean;
    shouldCancel: boolean;
    cancelReason?: string;
  }> {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert || alert.state !== WebhookMonitorAlertState.MONITORING) {
      throw new Error(`Alerta ${alertId} não encontrado ou não está em MONITORING`);
    }

    const config = await this.getConfig();
    const priceMinimum = alert.price_minimum?.toNumber() || alert.price_alert.toNumber();
    const priceAlert = alert.price_alert.toNumber();
    let newPriceMinimum = priceMinimum;
    let cyclesWithoutNewLow = alert.cycles_without_new_low;
    let trend: PriceTrend = PriceTrend.FALLING;
    let shouldExecute = false;
    let shouldCancel = false;
    let cancelReason: string | undefined;

    // Atualizar preço mínimo se necessário
    if (currentPrice < priceMinimum) {
      newPriceMinimum = currentPrice;
      cyclesWithoutNewLow = 0; // Reset contador quando faz novo fundo
      trend = PriceTrend.FALLING;
    } else {
      cyclesWithoutNewLow += 1;
      
      // Calcular variação percentual do preço atual em relação ao mínimo
      const priceVariationPct = ((currentPrice - newPriceMinimum) / newPriceMinimum) * 100;
      
      // Verificar se está lateralizando
      if (priceVariationPct <= config.lateral_tolerance_pct) {
        trend = PriceTrend.LATERAL;
        
        // Se está lateral há ciclos suficientes, pode executar
        if (cyclesWithoutNewLow >= config.lateral_cycles_min) {
          shouldExecute = true;
        }
      } else if (priceVariationPct >= config.rise_trigger_pct) {
        // Verificar se iniciou alta
        trend = PriceTrend.RISING;
        
        // Se subiu o suficiente e já passou ciclos mínimos, pode executar
        if (cyclesWithoutNewLow >= config.rise_cycles_min) {
          shouldExecute = true;
        }
      } else {
        // Ainda em queda, mas não fez novo fundo
        trend = PriceTrend.FALLING;
      }
    }

    // Verificar proteções
    const fallFromAlertPct = ((priceAlert - newPriceMinimum) / priceAlert) * 100;
    if (fallFromAlertPct > config.max_fall_pct) {
      shouldCancel = true;
      cancelReason = `Queda máxima excedida: ${fallFromAlertPct.toFixed(2)}% > ${config.max_fall_pct}%`;
    }

    // Verificar tempo máximo de monitoramento
    const monitoringTimeMinutes = (Date.now() - alert.created_at.getTime()) / (1000 * 60);
    if (monitoringTimeMinutes > config.max_monitoring_time_min) {
      shouldCancel = true;
      cancelReason = `Tempo máximo de monitoramento excedido: ${monitoringTimeMinutes.toFixed(1)}min > ${config.max_monitoring_time_min}min`;
    }

    // Atualizar alerta com monitoring_status
    const updatedAlert = await this.prisma.webhookMonitorAlert.update({
      where: { id: alertId },
      data: {
        price_minimum: newPriceMinimum,
        current_price: currentPrice,
        cycles_without_new_low: cyclesWithoutNewLow,
        last_price_check_at: new Date(),
        monitoring_status: trend, // Salvar status de monitoramento
      },
    });

    return {
      alert: updatedAlert,
      trend,
      shouldExecute,
      shouldCancel,
      cancelReason,
    };
  }

  /**
   * Atualizar monitoramento de preço para SELL (lógica invertida)
   */
  private async updatePriceMonitoringSELL(alertId: number, currentPrice: number): Promise<{
    alert: any;
    trend: PriceTrend;
    shouldExecute: boolean;
    shouldCancel: boolean;
    cancelReason?: string;
  }> {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert || alert.state !== WebhookMonitorAlertState.MONITORING) {
      throw new Error(`Alerta ${alertId} não encontrado ou não está em MONITORING`);
    }

    const config = await this.getConfig();
    const priceMaximum = alert.price_maximum?.toNumber() || alert.price_alert.toNumber();
    const priceAlert = alert.price_alert.toNumber();
    let newPriceMaximum = priceMaximum;
    let cyclesWithoutNewHigh = alert.cycles_without_new_high || 0;
    let trend: PriceTrend = PriceTrend.RISING;
    let shouldExecute = false;
    let shouldCancel = false;
    let cancelReason: string | undefined;

    // Atualizar preço máximo se necessário
    if (currentPrice > priceMaximum) {
      newPriceMaximum = currentPrice;
      cyclesWithoutNewHigh = 0; // Reset contador quando faz novo topo
      trend = PriceTrend.RISING;
    } else {
      cyclesWithoutNewHigh += 1;
      
      // Calcular variação percentual do preço atual em relação ao máximo
      const fallFromMaxPct = ((priceMaximum - currentPrice) / priceMaximum) * 100;
      const variationPct = ((currentPrice - priceMaximum) / priceMaximum) * 100;
      
      // Verificar se está lateralizando (dentro da tolerância do máximo)
      if (variationPct <= config.sell_lateral_tolerance_pct) {
        trend = PriceTrend.LATERAL;
        
        // Se está lateral há ciclos suficientes, pode executar
        if (cyclesWithoutNewHigh >= config.sell_lateral_cycles_min) {
          shouldExecute = true;
        }
      } else if (fallFromMaxPct >= config.sell_fall_trigger_pct) {
        // Verificar se iniciou queda (caiu do máximo)
        trend = PriceTrend.FALLING;
        
        // Se caiu o suficiente e já passou ciclos mínimos, pode executar
        if (cyclesWithoutNewHigh >= config.sell_fall_cycles_min) {
          shouldExecute = true;
        }
      } else {
        // Ainda próximo do máximo, mas não fez novo topo
        trend = PriceTrend.RISING;
      }
    }

    // Verificar proteções (para SELL: cancelar se subiu muito desde o alerta)
    const riseFromAlertPct = ((newPriceMaximum - priceAlert) / priceAlert) * 100;
    if (riseFromAlertPct > config.sell_max_rise_pct) {
      shouldCancel = true;
      cancelReason = `Alta máxima excedida: ${riseFromAlertPct.toFixed(2)}% > ${config.sell_max_rise_pct}%`;
    }

    // Verificar tempo máximo de monitoramento
    const monitoringTimeMinutes = (Date.now() - alert.created_at.getTime()) / (1000 * 60);
    if (monitoringTimeMinutes > config.sell_max_monitoring_time_min) {
      shouldCancel = true;
      cancelReason = `Tempo máximo de monitoramento excedido: ${monitoringTimeMinutes.toFixed(1)}min > ${config.sell_max_monitoring_time_min}min`;
    }

    // Atualizar alerta com monitoring_status
    const updatedAlert = await this.prisma.webhookMonitorAlert.update({
      where: { id: alertId },
      data: {
        price_maximum: newPriceMaximum,
        current_price: currentPrice,
        cycles_without_new_high: cyclesWithoutNewHigh,
        last_price_check_at: new Date(),
        monitoring_status: trend, // Salvar status de monitoramento
      },
    });

    return {
      alert: updatedAlert,
      trend,
      shouldExecute,
      shouldCancel,
      cancelReason,
    };
  }

  /**
   * Executar compra quando condições atendidas
   * Cria jobs para todas as contas vinculadas ao webhook que correspondem ao trade_mode
   */
  async executeAlert(alertId: number): Promise<any> {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id: alertId },
      include: {
        webhook_event: true,
        webhook_source: {
          include: {
            bindings: {
              where: { is_active: true },
              include: {
                exchange_account: {
                  select: {
                    id: true,
                    is_simulation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!alert || alert.state !== WebhookMonitorAlertState.MONITORING) {
      throw new Error(`Alerta ${alertId} não encontrado ou não está em MONITORING`);
    }

    console.log(`[WEBHOOK-MONITOR] Executando alerta ${alertId} para ${alert.symbol}`);

    // Criar TradeJobs para todas as contas vinculadas ao webhook que correspondem ao trade_mode
    const tradeJobIds: number[] = [];
    const eventIsSim = alert.trade_mode === 'SIMULATION';

    for (const binding of alert.webhook_source.bindings) {
      const accountIsSim = binding.exchange_account.is_simulation;
      
      // Verificar se trade mode corresponde
      if (accountIsSim !== eventIsSim) {
        console.log(`[WEBHOOK-MONITOR] Trade mode não corresponde para conta ${binding.exchange_account.id}, pulando`);
        continue;
      }

      try {
        // Usar o side do alerta (BUY ou SELL)
        const side = (alert as any).side || 'BUY';
        
        // Para vendas (SELL), buscar posições elegíveis e criar um job por posição
        if (side === 'SELL') {
          // ✅ NOVO: Buscar todas as posições elegíveis
          const eligiblePositions = await this.prisma.tradePosition.findMany({
            where: {
              exchange_account_id: binding.exchange_account.id,
              symbol: alert.symbol,
              trade_mode: alert.trade_mode,
              status: 'OPEN',
              qty_remaining: { gt: 0 },
              lock_sell_by_webhook: false,
            },
            orderBy: { created_at: 'asc' },
          });

          if (eligiblePositions.length === 0) {
            console.warn(`[WEBHOOK-MONITOR] Nenhuma posição elegível encontrada para venda do alerta ${alertId} na conta ${binding.exchange_account.id}`);
            continue;
          }

          // Usar LIMIT com preço do alerta
          const limitPrice = alert.current_price?.toNumber() || alert.price_alert?.toNumber();
          
          if (!limitPrice || limitPrice <= 0) {
            console.error(`[WEBHOOK-MONITOR] ❌ Não foi possível obter limitPrice para venda do alerta ${alertId}. current_price: ${alert.current_price?.toNumber()}, price_alert: ${alert.price_alert?.toNumber()}`);
            throw new Error(`Venda via webhook requer limitPrice válido. Alerta ${alertId} não tem preço disponível.`);
          }
          
          console.log(`[WEBHOOK-MONITOR] Venda detectada, criando ${eligiblePositions.length} job(s) com LIMIT, limitPrice=${limitPrice} (do alerta ${alertId})`);

          // ✅ NOVO: Criar um job por posição
          for (const position of eligiblePositions) {
            try {
              const tradeJob = await this.tradeJobService.createJob({
                webhookEventId: alert.webhook_event_id,
                exchangeAccountId: binding.exchange_account.id,
                tradeMode: alert.trade_mode as TradeMode,
                symbol: alert.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                limitPrice,
                baseQuantity: position.qty_remaining.toNumber(),
                positionIdToClose: position.id, // ✅ SEMPRE informar position_id
              });
              
              tradeJobIds.push(tradeJob.id);
              console.log(`[WEBHOOK-MONITOR] ✅ TradeJob criado para posição ${position.id}: ID=${tradeJob.id} (SELL, LIMIT, limitPrice=${limitPrice}, qty=${position.qty_remaining.toNumber()})`);
            } catch (positionError: any) {
              console.error(`[WEBHOOK-MONITOR] ❌ Erro ao criar TradeJob para posição ${position.id}: ${positionError.message}`);
            }
          }
        } else {
          // BUY - criar job normalmente (sem position_id)
          const tradeJob = await this.tradeJobService.createJob({
            webhookEventId: alert.webhook_event_id,
            exchangeAccountId: binding.exchange_account.id,
            tradeMode: alert.trade_mode as TradeMode,
            symbol: alert.symbol,
            side: 'BUY',
            orderType: 'MARKET',
          });
          
          tradeJobIds.push(tradeJob.id);
          console.log(`[WEBHOOK-MONITOR] ✅ TradeJob criado: ${tradeJob.id} para conta ${binding.exchange_account.id} (BUY, MARKET)`);
        }
      } catch (error: any) {
        console.error(`[WEBHOOK-MONITOR] ❌ Erro ao criar TradeJob para conta ${binding.exchange_account.id}: ${error.message}`);
      }
    }

    if (tradeJobIds.length === 0) {
      throw new Error(`Nenhum TradeJob foi criado para o alerta ${alertId}`);
    }

    // Buscar preço atual para armazenar como preço de execução
    const alertBeforeUpdate = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id: alertId },
    });
    const executionPrice = alertBeforeUpdate?.current_price || alertBeforeUpdate?.price_alert;
    const executionTime = new Date(); // Momento da execução

    // Criar detalhes de saída
    const exitDetails = alertBeforeUpdate?.monitoring_status === 'LATERAL'
      ? `Lateralizado por ${alertBeforeUpdate.cycles_without_new_low || alertBeforeUpdate.cycles_without_new_high || 0} ciclos`
      : alertBeforeUpdate?.monitoring_status === 'RISING'
      ? `Em alta por ${alertBeforeUpdate.cycles_without_new_low || alertBeforeUpdate.cycles_without_new_high || 0} ciclos`
      : alertBeforeUpdate?.monitoring_status === 'FALLING'
      ? `Em queda por ${alertBeforeUpdate.cycles_without_new_low || alertBeforeUpdate.cycles_without_new_high || 0} ciclos`
      : 'Executado';

    // Calcular métricas de performance se alertBeforeUpdate está disponível
    let monitoringDurationMinutes = 0;
    let savingsPct = 0;
    let efficiencyPct = 0;

    if (alertBeforeUpdate) {
      // Usar o momento da execução para calcular a duração
      monitoringDurationMinutes = Math.round(
        (executionTime.getTime() - new Date(alertBeforeUpdate.created_at).getTime()) / 60000
      );

      const priceAlert = alertBeforeUpdate.price_alert.toNumber();
      const execPrice = executionPrice?.toNumber() || priceAlert;
      const side = (alertBeforeUpdate as any).side || 'BUY';

      // Calcular economia vs preço inicial
      // Para BUY: economia positiva quando executa abaixo do preço do alerta
      // Para SELL: economia positiva quando executa acima do preço do alerta
      if (side === 'BUY') {
        savingsPct = ((priceAlert - execPrice) / priceAlert) * 100;
      } else {
        // SELL: economia é quando vende acima do preço do alerta
        savingsPct = ((execPrice - priceAlert) / priceAlert) * 100;
      }

      // Calcular eficiência (proximidade do melhor preço)
      if (side === 'BUY' && alertBeforeUpdate.price_minimum) {
        const priceMin = alertBeforeUpdate.price_minimum.toNumber();
        if (priceAlert !== priceMin) {
          efficiencyPct = ((priceAlert - execPrice) / (priceAlert - priceMin)) * 100;
        }
      } else if (side === 'SELL' && alertBeforeUpdate.price_maximum) {
        const priceMax = alertBeforeUpdate.price_maximum.toNumber();
        if (priceMax !== priceAlert) {
          efficiencyPct = ((execPrice - priceAlert) / (priceMax - priceAlert)) * 100;
        }
      }
    }

    // Atualizar alerta como executado com métricas
    const updatedAlert = await this.prisma.webhookMonitorAlert.update({
      where: { id: alertId },
      data: {
        state: WebhookMonitorAlertState.EXECUTED,
        executed_trade_job_id: tradeJobIds[0], // Guardar o primeiro job ID para referência
        executed_trade_job_ids_json: tradeJobIds, // Guardar todos os job IDs
        execution_price: executionPrice,
        exit_reason: 'EXECUTED',
        exit_details: exitDetails,
        monitoring_duration_minutes: monitoringDurationMinutes,
        savings_pct: savingsPct,
        efficiency_pct: Math.min(100, Math.max(0, efficiencyPct)),
      },
    });

    console.log(`[WEBHOOK-MONITOR] ✅ Alerta ${alertId} executado, ${tradeJobIds.length} TradeJob(s) criado(s): ${tradeJobIds.join(', ')}`);

    // ✅ BUG 5 FIX: Atualizar webhook_event para JOB_CREATED após criar jobs
    if (alert.webhook_event_id) {
      try {
        await this.prisma.webhookEvent.update({
          where: { id: alert.webhook_event_id },
          data: {
            status: 'JOB_CREATED',
            processed_at: new Date(),
          },
        });
        console.log(`[WEBHOOK-MONITOR] ✅ Webhook event ${alert.webhook_event_id} atualizado para JOB_CREATED`);
      } catch (error: any) {
        console.warn(`[WEBHOOK-MONITOR] ⚠️ Erro ao atualizar webhook_event ${alert.webhook_event_id}: ${error.message}`);
        // Não falhar o processo se não conseguir atualizar o evento
      }
    } else {
      console.warn(`[WEBHOOK-MONITOR] ⚠️ Alerta ${alertId} não tem webhook_event_id, pulando atualização de status`);
    }

    return updatedAlert;
  }

  /**
   * Cancelar alerta
   */
  async cancelAlert(alertId: number, reason: string): Promise<any> {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert || alert.state !== WebhookMonitorAlertState.MONITORING) {
      throw new Error(`Alerta ${alertId} não encontrado ou não está em MONITORING`);
    }

    console.log(`[WEBHOOK-MONITOR] Cancelando alerta ${alertId}: ${reason}`);

    const updatedAlert = await this.prisma.webhookMonitorAlert.update({
      where: { id: alertId },
      data: {
        state: WebhookMonitorAlertState.CANCELLED,
        cancel_reason: reason,
      },
    });

    // ✅ BUG 6 FIX: Atualizar webhook_event para SKIPPED após cancelar alerta
    if (alert.webhook_event_id) {
      try {
        await this.prisma.webhookEvent.update({
          where: { id: alert.webhook_event_id },
          data: {
            status: 'SKIPPED',
            processed_at: new Date(),
          },
        });
        console.log(`[WEBHOOK-MONITOR] ✅ Webhook event ${alert.webhook_event_id} atualizado para SKIPPED`);
      } catch (error: any) {
        console.warn(`[WEBHOOK-MONITOR] ⚠️ Erro ao atualizar webhook_event ${alert.webhook_event_id}: ${error.message}`);
        // Não falhar o processo se não conseguir atualizar o evento
      }
    } else {
      console.warn(`[WEBHOOK-MONITOR] ⚠️ Alerta ${alertId} não tem webhook_event_id, pulando atualização de status`);
    }

    return updatedAlert;
  }

  /**
   * Método principal chamado pelo job de monitoramento
   */
  async checkAndExecuteAlerts(): Promise<{
    checked: number;
    executed: number;
    cancelled: number;
    errors: number;
  }> {
    const activeAlerts = await this.prisma.webhookMonitorAlert.findMany({
      where: {
        state: WebhookMonitorAlertState.MONITORING,
      },
      include: {
        webhook_source: {
          include: {
            bindings: {
              where: { is_active: true },
              include: {
                exchange_account: {
                  select: {
                    exchange: true,
                  },
                },
              },
              take: 1, // Pegar apenas uma conta para buscar o exchange
            },
          },
        },
      },
    });

    let checked = 0;
    let executed = 0;
    let cancelled = 0;
    let errors = 0;

    for (const alert of activeAlerts) {
      try {
        checked++;

        // Buscar preço atual usando a primeira conta vinculada ao webhook
        const firstBinding = alert.webhook_source.bindings[0];
        if (!firstBinding?.exchange_account) {
          console.warn(`[WEBHOOK-MONITOR] Nenhuma conta vinculada ao webhook ${alert.webhook_source_id} para buscar preço`);
          continue;
        }

        const currentPrice = await this.getCurrentPrice(
          firstBinding.exchange_account.exchange,
          alert.symbol
        );

        if (!currentPrice || currentPrice <= 0) {
          console.warn(`[WEBHOOK-MONITOR] Preço inválido para ${alert.symbol}: ${currentPrice}`);
          continue;
        }

        // Atualizar monitoramento
        const { shouldExecute, shouldCancel, cancelReason } =
          await this.updatePriceMonitoring(alert.id, currentPrice);

        if (shouldCancel) {
          await this.cancelAlert(alert.id, cancelReason || 'Proteção ativada');
          cancelled++;
        } else if (shouldExecute) {
          await this.executeAlert(alert.id);
          executed++;
        }
      } catch (error: any) {
        errors++;
        console.error(`[WEBHOOK-MONITOR] Erro ao processar alerta ${alert.id}:`, error.message);
      }
    }

    return { checked, executed, cancelled, errors };
  }

  /**
   * Buscar preço atual (será integrado com cache do price-sync)
   * Nota: Este método não é usado diretamente, o processor busca os preços
   */
  private async getCurrentPrice(_exchange: string, _symbol: string): Promise<number | null> {
    // Este método não é usado - o processor busca preços diretamente
    return null;
  }

  /**
   * Listar alertas ativos
   */
  async listActiveAlerts(userId?: number): Promise<any[]> {
    const where: any = {
      state: WebhookMonitorAlertState.MONITORING,
    };

    // Filtrar por usuário através do webhook_source (owner) ou através dos bindings
    if (userId) {
      where.webhook_source = {
        OR: [
          { owner_user_id: userId }, // Webhook próprio do usuário
          {
            bindings: {
              some: {
                is_active: true,
                exchange_account: {
                  user_id: userId,
                },
              },
            },
          }, // Webhook compartilhado com conta do usuário
        ],
      };
    }

    return this.prisma.webhookMonitorAlert.findMany({
      where,
      include: {
        webhook_source: {
          select: {
            id: true,
            label: true,
            webhook_code: true,
          },
        },
        exchange_account: {
          select: {
            id: true,
            label: true,
            exchange: true,
          },
        },
        webhook_event: {
          select: {
            id: true,
            action: true,
            created_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  /**
   * Listar histórico de alertas
   * Agrupa por (webhook_source_id, symbol, trade_mode) e retorna apenas o mais recente de cada grupo
   */
  async listHistory(filters: {
    userId?: number;
    symbol?: string;
    state?: WebhookMonitorAlertState;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    // Construir condições WHERE para a query SQL
    const conditions: string[] = [];
    const params: any[] = [];

    // Filtrar por state
    if (filters.state) {
      conditions.push(`wma.state = ?`);
      params.push(filters.state);
    } else {
      conditions.push(`wma.state IN (?, ?)`);
      params.push(WebhookMonitorAlertState.EXECUTED, WebhookMonitorAlertState.CANCELLED);
    }

    // Filtrar por symbol
    if (filters.symbol) {
      conditions.push(`wma.symbol = ?`);
      params.push(filters.symbol);
    }

    // Filtrar por data
    if (filters.startDate) {
      conditions.push(`wma.created_at >= ?`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`wma.created_at <= ?`);
      params.push(filters.endDate);
    }

    // Filtrar por userId através de webhook_source
    let userIdCondition = '';
    if (filters.userId) {
      userIdCondition = `AND (
        ws.owner_user_id = ?
        OR EXISTS (
          SELECT 1 FROM account_webhook_bindings awb
          INNER JOIN exchange_accounts ea ON awb.exchange_account_id = ea.id
          WHERE awb.webhook_source_id = wma.webhook_source_id
            AND awb.is_active = true
            AND ea.user_id = ?
        )
      )`;
      params.push(filters.userId, filters.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query SQL raw para identificar os IDs mais recentes de cada grupo (webhook_source_id, symbol, trade_mode)
    // Usa uma subquery correlacionada para pegar o ID mais recente de cada grupo
    const latestIdsQuery = `
      SELECT wma.id
      FROM webhook_monitor_alerts wma
      INNER JOIN webhook_sources ws ON wma.webhook_source_id = ws.id
      ${whereClause}
      ${userIdCondition}
      AND wma.id = (
        SELECT wma2.id
        FROM webhook_monitor_alerts wma2
        WHERE wma2.webhook_source_id = wma.webhook_source_id
          AND wma2.symbol = wma.symbol
          AND wma2.trade_mode = wma.trade_mode
        ORDER BY wma2.created_at DESC, wma2.id DESC
        LIMIT 1
      )
      ORDER BY wma.created_at DESC
      ${filters.limit ? `LIMIT ?` : 'LIMIT 100'}
    `;

    if (filters.limit) {
      params.push(filters.limit);
    }

    // Executar query raw para obter os IDs
    const latestIds = await this.prisma.$queryRawUnsafe<Array<{ id: number }>>(
      latestIdsQuery,
      ...params
    );

    if (latestIds.length === 0) {
      return [];
    }

    const ids = latestIds.map((row) => row.id);

    // Buscar os detalhes completos dos alertas usando Prisma
    const alerts = await this.prisma.webhookMonitorAlert.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      include: {
        webhook_source: {
          select: {
            id: true,
            label: true,
            webhook_code: true,
          },
        },
        exchange_account: {
          select: {
            id: true,
            label: true,
            exchange: true,
          },
        },
        webhook_event: {
          select: {
            id: true,
            action: true,
            created_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Calcular métricas para alertas que não têm esses valores calculados
    const alertsToUpdate: number[] = [];
    for (const alert of alerts) {
      if (alert.state === 'EXECUTED' && (
        alert.monitoring_duration_minutes === null ||
        alert.savings_pct === null ||
        alert.efficiency_pct === null
      )) {
        alertsToUpdate.push(alert.id);
      }
    }

    // Calcular métricas em lote para alertas que precisam
    if (alertsToUpdate.length > 0) {
      try {
        await this.calculateMetricsForExecutedAlerts(alertsToUpdate);
        // Buscar novamente os alertas atualizados
        const updatedAlerts = await this.prisma.webhookMonitorAlert.findMany({
          where: {
            id: { in: alertsToUpdate },
          },
        });
        // Atualizar os alertas na lista original com os valores calculados
        const updatedMap = new Map(updatedAlerts.map(a => [a.id, a]));
        for (const alert of alerts) {
          const updated = updatedMap.get(alert.id);
          if (updated) {
            (alert as any).monitoring_duration_minutes = updated.monitoring_duration_minutes;
            (alert as any).savings_pct = updated.savings_pct;
            (alert as any).efficiency_pct = updated.efficiency_pct;
          }
        }
      } catch (error: any) {
        console.error('[WEBHOOK-MONITOR] Erro ao calcular métricas no listHistory:', error.message);
        // Continuar mesmo se houver erro no cálculo
      }
    }

    return alerts;
  }

  /**
   * Calcular métricas retroativamente para alertas já executados que não têm métricas
   * Útil para popular dados históricos após adicionar os campos
   */
  async calculateMetricsForExecutedAlerts(alertIds?: number[]): Promise<{
    processed: number;
    errors: number;
  }> {
    const where: any = {
      state: 'EXECUTED',
    };

    // Se IDs específicos foram fornecidos, processar apenas eles
    if (alertIds && alertIds.length > 0) {
      where.id = { in: alertIds };
    } else {
      // Processar apenas alertas que não têm métricas calculadas
      where.OR = [
        { monitoring_duration_minutes: null },
        { savings_pct: null },
        { efficiency_pct: null },
      ];
    }

    const alerts = await this.prisma.webhookMonitorAlert.findMany({
      where,
      select: {
        id: true,
        created_at: true,
        updated_at: true,
        price_alert: true,
        execution_price: true,
        price_minimum: true,
        price_maximum: true,
        side: true,
      },
    });

    let processed = 0;
    let errors = 0;

    for (const alert of alerts) {
      try {
        // Calcular duração do monitoramento
        const monitoringDurationMinutes = Math.round(
          (new Date(alert.updated_at).getTime() - new Date(alert.created_at).getTime()) / 60000
        );

        const priceAlert = alert.price_alert.toNumber();
        const executionPrice = alert.execution_price?.toNumber() || priceAlert;
        const side = (alert as any).side || 'BUY';

        // Calcular economia vs preço inicial
        // Para BUY: economia positiva quando executa abaixo do preço do alerta
        // Para SELL: economia positiva quando executa acima do preço do alerta
        let savingsPct = 0;
        if (side === 'BUY') {
          savingsPct = ((priceAlert - executionPrice) / priceAlert) * 100;
        } else {
          // SELL: economia é quando vende acima do preço do alerta
          savingsPct = ((executionPrice - priceAlert) / priceAlert) * 100;
        }

        // Calcular eficiência (proximidade do melhor preço)
        let efficiencyPct = 0;
        if (side === 'BUY' && alert.price_minimum) {
          const priceMin = alert.price_minimum.toNumber();
          if (priceAlert !== priceMin) {
            efficiencyPct = ((priceAlert - executionPrice) / (priceAlert - priceMin)) * 100;
          }
        } else if (side === 'SELL' && alert.price_maximum) {
          const priceMax = alert.price_maximum.toNumber();
          if (priceMax !== priceAlert) {
            efficiencyPct = ((executionPrice - priceAlert) / (priceMax - priceAlert)) * 100;
          }
        }

        // Atualizar alerta com métricas
        await this.prisma.webhookMonitorAlert.update({
          where: { id: alert.id },
          data: {
            monitoring_duration_minutes: monitoringDurationMinutes,
            savings_pct: savingsPct,
            efficiency_pct: Math.min(100, Math.max(0, efficiencyPct)),
          },
        });

        processed++;
      } catch (error: any) {
        console.error(`[WEBHOOK-MONITOR] Erro ao calcular métricas para alerta ${alert.id}:`, error.message);
        errors++;
      }
    }

    return { processed, errors };
  }
}

