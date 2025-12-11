import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TradeMode, TradeJobStatus } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';

@Injectable()
export class TradeJobQueueService {
  private readonly logger = new Logger(TradeJobQueueService.name);

  constructor(
    @InjectQueue('trade-execution-real') private realQueue: Queue,
    @InjectQueue('trade-execution-sim') private simQueue: Queue,
    private prisma: PrismaService
  ) {}

  /**
   * Enfileira um trade job no BullMQ para execução
   */
  async enqueueTradeJob(tradeJobId: number): Promise<void> {
    try {
      const tradeJob = await this.prisma.tradeJob.findUnique({
        where: { id: tradeJobId },
        include: { exchange_account: true },
      });

      if (!tradeJob) {
        throw new Error(`Trade job ${tradeJobId} não encontrado`);
      }

      // Determinar qual fila usar baseado no trade_mode
      const queue = tradeJob.trade_mode === TradeMode.REAL ? this.realQueue : this.simQueue;
      const queueName = tradeJob.trade_mode === TradeMode.REAL ? 'trade-execution-real' : 'trade-execution-sim';

      // Verificar se o job já está enfileirado (evitar duplicatas)
      const existingJobs = await queue.getJobs(['waiting', 'active', 'delayed']);
      const alreadyEnqueued = existingJobs.some(
        (job) => job.data.tradeJobId === tradeJobId
      );

      if (alreadyEnqueued) {
        this.logger.warn(`Trade job ${tradeJobId} já está enfileirado na fila ${queueName}`);
        return;
      }

      // Enfileirar o job
      await queue.add('execute-trade', { tradeJobId }, {
        jobId: `trade-job-${tradeJobId}`,
        attempts: 1,
        removeOnComplete: {
          age: 24 * 3600, // Manter por 24 horas
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Manter falhas por 7 dias
        },
      });

      this.logger.log(`Trade job ${tradeJobId} enfileirado na fila ${queueName}`);
    } catch (error: any) {
      this.logger.error(`Erro ao enfileirar trade job ${tradeJobId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Enfileira múltiplos trade jobs
   */
  async enqueueTradeJobs(tradeJobIds: number[]): Promise<void> {
    for (const jobId of tradeJobIds) {
      try {
        await this.enqueueTradeJob(jobId);
      } catch (error: any) {
        this.logger.error(`Erro ao enfileirar trade job ${jobId}: ${error?.message || 'Erro desconhecido'}`);
        // Continuar com os próximos jobs mesmo se um falhar
      }
    }
  }
}

