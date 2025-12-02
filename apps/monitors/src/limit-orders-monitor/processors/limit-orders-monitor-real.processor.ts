import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus, TradeMode } from '@mvcashnode/shared';

@Processor('limit-orders-monitor-real')
export class LimitOrdersMonitorRealProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    // Get all pending limit orders
    const limitOrders = await this.prisma.tradeJob.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: TradeJobStatus.PENDING_LIMIT,
        order_type: 'LIMIT',
      },
      include: {
        exchange_account: true,
        executions: {
          take: 1,
          orderBy: { id: 'desc' },
        },
      },
    });

    const accountService = new (await import('@mvcashnode/domain')).ExchangeAccountService(
      this.prisma,
      this.encryptionService
    );
    const positionService = new PositionService(this.prisma);
    let filled = 0;
    let canceled = 0;

    for (const order of limitOrders) {
      try {
        // Check expiration
        if (order.limit_order_expires_at && order.limit_order_expires_at < new Date()) {
          await this.prisma.tradeJob.update({
            where: { id: order.id },
            data: {
              status: TradeJobStatus.CANCELED,
              reason_code: 'EXPIRED',
            },
          });
          canceled++;
          continue;
        }

        // Get API keys
        const keys = await accountService.decryptApiKeys(order.exchange_account_id);
        if (!keys) continue;

        // Se não há execution ainda, significa que a ordem ainda não foi criada na exchange
        // Isso pode acontecer se o job foi criado mas não foi processado pelo executor ainda
        const existingExecution = order.executions && order.executions.length > 0 ? order.executions[0] : null;
        
        if (!existingExecution?.exchange_order_id) {
          // Ordem ainda não foi criada na exchange - aguardar processamento pelo executor
          // Por enquanto, apenas logar e continuar - o executor processará quando enfileirado
          console.log(`[LIMIT-MONITOR] Ordem LIMIT ${order.id} ainda não tem execution. Aguardando processamento pelo executor.`);
          continue;
        }

        // Create adapter
        const adapter = AdapterFactory.createAdapter(
          order.exchange_account.exchange as ExchangeType,
          keys.apiKey,
          keys.apiSecret,
          { testnet: order.exchange_account.testnet }
        );

        // Check order status
        const exchangeOrder = await adapter.fetchOrder(existingExecution.exchange_order_id, order.symbol);

        if (exchangeOrder.status === 'FILLED' || exchangeOrder.status === 'closed') {
          // Create execution
          const execution = await this.prisma.tradeExecution.create({
            data: {
              trade_job_id: order.id,
              exchange_account_id: order.exchange_account_id,
              trade_mode: order.trade_mode,
              exchange: order.exchange_account.exchange,
              exchange_order_id: exchangeOrder.id,
              client_order_id: `client-${order.id}`,
              status_exchange: exchangeOrder.status,
              executed_qty: exchangeOrder.filled || exchangeOrder.amount,
              cumm_quote_qty: exchangeOrder.cost || 0,
              avg_price: exchangeOrder.average || exchangeOrder.price || 0,
              raw_response_json: JSON.parse(JSON.stringify(exchangeOrder)),
            },
          });

          // Update position
          if (order.side === 'BUY') {
            await positionService.onBuyExecuted(
              order.id,
              execution.id,
              execution.executed_qty.toNumber(),
              execution.avg_price.toNumber()
            );
          } else {
            await positionService.onSellExecuted(
              order.id,
              execution.id,
              execution.executed_qty.toNumber(),
              execution.avg_price.toNumber(),
              'MANUAL'
            );
          }

          // Update job
          await this.prisma.tradeJob.update({
            where: { id: order.id },
            data: { status: TradeJobStatus.FILLED },
          });

          filled++;
        } else if (exchangeOrder.status === 'CANCELED' || exchangeOrder.status === 'EXPIRED') {
          await this.prisma.tradeJob.update({
            where: { id: order.id },
            data: {
              status: TradeJobStatus.CANCELED,
              reason_code: exchangeOrder.status,
            },
          });
          canceled++;
        }
      } catch (error) {
        console.error(`Error processing limit order ${order.id}:`, error);
      }
    }

    return { ordersChecked: limitOrders.length, filled, canceled };
  }
}

