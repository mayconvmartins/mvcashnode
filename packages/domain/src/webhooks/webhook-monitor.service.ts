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
  lateral_tolerance_pct: number;
  lateral_cycles_min: number;
  rise_trigger_pct: number;
  rise_cycles_min: number;
  max_fall_pct: number;
  max_monitoring_time_min: number;
  cooldown_after_execution_min: number;
}

export interface CreateOrUpdateAlertDto {
  webhookEventId: number;
  webhookSourceId: number;
  exchangeAccountId: number;
  symbol: string;
  tradeMode: TradeMode;
  priceAlert: number;
}

export class WebhookMonitorService {
  private readonly defaultConfig: WebhookMonitorConfig = {
    monitor_enabled: true,
    check_interval_sec: 30,
    lateral_tolerance_pct: 0.3,
    lateral_cycles_min: 4,
    rise_trigger_pct: 0.75,
    rise_cycles_min: 2,
    max_fall_pct: 6.0,
    max_monitoring_time_min: 60,
    cooldown_after_execution_min: 30,
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
        return {
          monitor_enabled: userConfig.monitor_enabled,
          check_interval_sec: userConfig.check_interval_sec,
          lateral_tolerance_pct: userConfig.lateral_tolerance_pct.toNumber(),
          lateral_cycles_min: userConfig.lateral_cycles_min,
          rise_trigger_pct: userConfig.rise_trigger_pct.toNumber(),
          rise_cycles_min: userConfig.rise_cycles_min,
          max_fall_pct: userConfig.max_fall_pct.toNumber(),
          max_monitoring_time_min: userConfig.max_monitoring_time_min,
          cooldown_after_execution_min: userConfig.cooldown_after_execution_min,
        };
      }
    }

    // Buscar configuração global (user_id = null)
    const globalConfig = await this.prisma.webhookMonitorConfig.findFirst({
      where: { user_id: null },
    });

    if (globalConfig) {
      return {
        monitor_enabled: globalConfig.monitor_enabled,
        check_interval_sec: globalConfig.check_interval_sec,
        lateral_tolerance_pct: globalConfig.lateral_tolerance_pct.toNumber(),
        lateral_cycles_min: globalConfig.lateral_cycles_min,
        rise_trigger_pct: globalConfig.rise_trigger_pct.toNumber(),
        rise_cycles_min: globalConfig.rise_cycles_min,
        max_fall_pct: globalConfig.max_fall_pct.toNumber(),
        max_monitoring_time_min: globalConfig.max_monitoring_time_min,
        cooldown_after_execution_min: globalConfig.cooldown_after_execution_min,
      };
    }

    return this.defaultConfig;
  }

  /**
   * Criar ou atualizar alerta ativo
   * Se já existe alerta MONITORING para o mesmo par, substitui se o novo preço for menor
   */
  async createOrUpdateAlert(dto: CreateOrUpdateAlertDto): Promise<any> {
    // Buscar alerta ativo existente (MONITORING) para o mesmo par
    const existingAlert = await this.prisma.webhookMonitorAlert.findFirst({
      where: {
        exchange_account_id: dto.exchangeAccountId,
        symbol: dto.symbol,
        trade_mode: dto.tradeMode,
        state: WebhookMonitorAlertState.MONITORING,
      },
    });

    if (existingAlert) {
      const existingMinPrice = existingAlert.price_minimum.toNumber();
      
      // Se novo alerta é mais barato, substituir
      if (dto.priceAlert < existingMinPrice) {
        console.log(`[WEBHOOK-MONITOR] Substituindo alerta existente (preço antigo: ${existingMinPrice}, novo: ${dto.priceAlert})`);
        
        // Cancelar alerta antigo
        await this.prisma.webhookMonitorAlert.update({
          where: { id: existingAlert.id },
          data: {
            state: WebhookMonitorAlertState.CANCELLED,
            cancel_reason: `Substituído por alerta mais barato (${dto.priceAlert} < ${existingMinPrice})`,
          },
        });

        // Criar novo alerta
        return this.createNewAlert(dto);
      } else {
        // Novo alerta é mais caro, ignorar
        console.log(`[WEBHOOK-MONITOR] Ignorando alerta mais caro (existente: ${existingMinPrice}, novo: ${dto.priceAlert})`);
        return existingAlert;
      }
    }

    // Verificar cooldown
    const cooldownConfig = await this.getConfig();
    const cooldownMinutesAgo = new Date();
    cooldownMinutesAgo.setMinutes(
      cooldownMinutesAgo.getMinutes() - cooldownConfig.cooldown_after_execution_min
    );

    const recentExecution = await this.prisma.webhookMonitorAlert.findFirst({
      where: {
        exchange_account_id: dto.exchangeAccountId,
        symbol: dto.symbol,
        trade_mode: dto.tradeMode,
        state: WebhookMonitorAlertState.EXECUTED,
        updated_at: { gte: cooldownMinutesAgo },
      },
    });

    if (recentExecution) {
      console.log(`[WEBHOOK-MONITOR] Cooldown ativo para ${dto.symbol}, ignorando novo alerta`);
      throw new Error(`Cooldown ativo para ${dto.symbol}. Aguarde ${cooldownConfig.cooldown_after_execution_min} minutos após execução.`);
    }

    // Criar novo alerta
    return this.createNewAlert(dto);
  }

  private async createNewAlert(dto: CreateOrUpdateAlertDto): Promise<any> {
    const alert = await this.prisma.webhookMonitorAlert.create({
      data: {
        webhook_source_id: dto.webhookSourceId,
        webhook_event_id: dto.webhookEventId,
        exchange_account_id: dto.exchangeAccountId,
        symbol: dto.symbol,
        trade_mode: dto.tradeMode,
        price_alert: dto.priceAlert,
        price_minimum: dto.priceAlert,
        current_price: dto.priceAlert,
        state: WebhookMonitorAlertState.MONITORING,
        cycles_without_new_low: 0,
        last_price_check_at: new Date(),
      },
    });

    console.log(`[WEBHOOK-MONITOR] ✅ Alerta criado: ID=${alert.id}, símbolo=${dto.symbol}, preço=${dto.priceAlert}`);
    return alert;
  }

  /**
   * Buscar alerta ativo por par
   */
  async getActiveAlert(
    symbol: string,
    exchangeAccountId: number,
    tradeMode: TradeMode
  ): Promise<any | null> {
    return this.prisma.webhookMonitorAlert.findFirst({
      where: {
        exchange_account_id: exchangeAccountId,
        symbol,
        trade_mode: tradeMode,
        state: WebhookMonitorAlertState.MONITORING,
      },
    });
  }

  /**
   * Atualizar monitoramento de preço
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

    const config = await this.getConfig();
    const priceMinimum = alert.price_minimum.toNumber();
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

    // Atualizar alerta
    const updatedAlert = await this.prisma.webhookMonitorAlert.update({
      where: { id: alertId },
      data: {
        price_minimum: newPriceMinimum,
        current_price: currentPrice,
        cycles_without_new_low: cyclesWithoutNewLow,
        last_price_check_at: new Date(),
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
   */
  async executeAlert(alertId: number): Promise<any> {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id: alertId },
      include: {
        webhook_event: true,
        exchange_account: true,
      },
    });

    if (!alert || alert.state !== WebhookMonitorAlertState.MONITORING) {
      throw new Error(`Alerta ${alertId} não encontrado ou não está em MONITORING`);
    }

    console.log(`[WEBHOOK-MONITOR] Executando alerta ${alertId} para ${alert.symbol}`);

    // Criar TradeJob usando o webhook event original
    const tradeJob = await this.tradeJobService.createJob({
      webhookEventId: alert.webhook_event_id,
      exchangeAccountId: alert.exchange_account_id,
      tradeMode: alert.trade_mode as TradeMode,
      symbol: alert.symbol,
      side: 'BUY',
      orderType: 'MARKET',
    });

    // Atualizar alerta como executado
    const updatedAlert = await this.prisma.webhookMonitorAlert.update({
      where: { id: alertId },
      data: {
        state: WebhookMonitorAlertState.EXECUTED,
        executed_trade_job_id: tradeJob.id,
      },
    });

    console.log(`[WEBHOOK-MONITOR] ✅ Alerta ${alertId} executado, TradeJob criado: ${tradeJob.id}`);
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

    return this.prisma.webhookMonitorAlert.update({
      where: { id: alertId },
      data: {
        state: WebhookMonitorAlertState.CANCELLED,
        cancel_reason: reason,
      },
    });
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
        exchange_account: {
          select: {
            exchange: true,
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

        // Buscar preço atual (será implementado com cache do price-sync)
        // Por enquanto, vamos usar um método auxiliar
        const currentPrice = await this.getCurrentPrice(
          alert.exchange_account.exchange,
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

    if (userId) {
      where.exchange_account = {
        user_id: userId,
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
   */
  async listHistory(filters: {
    userId?: number;
    symbol?: string;
    state?: WebhookMonitorAlertState;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const where: any = {};

    if (filters.userId) {
      where.exchange_account = {
        user_id: filters.userId,
      };
    }

    if (filters.symbol) {
      where.symbol = filters.symbol;
    }

    if (filters.state) {
      where.state = filters.state;
    }

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) {
        where.created_at.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.created_at.lte = filters.endDate;
      }
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
      take: filters.limit || 100,
    });
  }
}

