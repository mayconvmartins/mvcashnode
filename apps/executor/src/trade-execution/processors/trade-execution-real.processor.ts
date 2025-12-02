import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import {
  PositionService,
  TradeJobService,
  ExchangeAccountService,
  VaultService,
} from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { BinanceSpotAdapter } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus } from '@mvcashnode/shared';

@Processor('trade-execution-real')
export class TradeExecutionRealProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { tradeJobId } = job.data;

    const tradeJob = await this.prisma.tradeJob.findUnique({
      where: { id: tradeJobId },
      include: {
        exchange_account: true,
      },
    });

    if (!tradeJob || tradeJob.trade_mode !== 'REAL') {
      throw new Error('Invalid trade job');
    }

    // Update status to EXECUTING
    await this.prisma.tradeJob.update({
      where: { id: tradeJobId },
      data: { status: TradeJobStatus.EXECUTING },
    });

    try {
      // Get API keys
      const accountService = new ExchangeAccountService(
        this.prisma,
        this.encryptionService
      );
      const keys = await accountService.decryptApiKeys(tradeJob.exchange_account_id);

      if (!keys) {
        throw new Error('API keys not found');
      }

      // Create adapter
      const adapter = new BinanceSpotAdapter(
        tradeJob.exchange_account.exchange as ExchangeType,
        keys.apiKey,
        keys.apiSecret,
        { testnet: tradeJob.exchange_account.testnet }
      );

      // Execute order
      const orderType = tradeJob.order_type === 'LIMIT' ? 'limit' : 'market';
      const order = await adapter.createOrder(
        tradeJob.symbol,
        orderType,
        tradeJob.side.toLowerCase(),
        tradeJob.base_quantity?.toNumber() || 0,
        tradeJob.limit_price?.toNumber()
      );

      // Create execution
      const execution = await this.prisma.tradeExecution.create({
        data: {
          trade_job_id: tradeJobId,
          exchange_account_id: tradeJob.exchange_account_id,
          trade_mode: tradeJob.trade_mode,
          exchange: tradeJob.exchange_account.exchange,
          exchange_order_id: order.id,
          client_order_id: `client-${tradeJobId}`,
          status_exchange: order.status,
          executed_qty: order.filled || order.amount,
          cumm_quote_qty: order.cost || 0,
          avg_price: order.average || order.price || 0,
          raw_response_json: JSON.parse(JSON.stringify(order)),
        },
      });

      // Update position
      const positionService = new PositionService(this.prisma);
      if (tradeJob.side === 'BUY') {
        await positionService.onBuyExecuted(
          tradeJobId,
          execution.id,
          execution.executed_qty.toNumber(),
          execution.avg_price.toNumber()
        );
      } else {
        await positionService.onSellExecuted(
          tradeJobId,
          execution.id,
          execution.executed_qty.toNumber(),
          execution.avg_price.toNumber(),
          'WEBHOOK'
        );
      }

      // Update vault if applicable
      if (tradeJob.vault_id) {
        const vaultService = new VaultService(this.prisma);
        if (tradeJob.side === 'BUY') {
          await vaultService.confirmBuy(
            tradeJob.vault_id,
            'USDT',
            execution.cumm_quote_qty.toNumber(),
            tradeJobId
          );
        } else {
          await vaultService.creditOnSell(
            tradeJob.vault_id,
            'USDT',
            execution.cumm_quote_qty.toNumber(),
            tradeJobId
          );
        }
      }

      // Update job status
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: { status: TradeJobStatus.FILLED },
      });

      return { success: true, executionId: execution.id };
    } catch (error: any) {
      // Update job status to FAILED
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: {
          status: TradeJobStatus.FAILED,
          reason_code: 'EXECUTION_ERROR',
          reason_message: error.message,
        },
      });

      throw error;
    }
  }
}

