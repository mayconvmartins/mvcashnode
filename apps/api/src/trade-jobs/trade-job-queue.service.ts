import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TradeMode, TradeJobStatus } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';

// ✅ SEGURANÇA: Status finais que não devem ser reprocessados
const FINAL_STATUSES = [
  TradeJobStatus.FILLED,
  TradeJobStatus.PARTIALLY_FILLED,
  TradeJobStatus.SKIPPED,
  TradeJobStatus.FAILED,
  TradeJobStatus.CANCELED,
];

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
   * 
   * ✅ VALIDAÇÕES DE SEGURANÇA:
   * 1. Verifica se job existe
   * 2. Verifica se job não está em status final (previne reprocessamento)
   * 3. Verifica se conta está ativa
   * 4. Verifica se SELL tem quantidade válida
   * 5. Verifica se não está duplicado na fila
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

      // ✅ HARD-BLOCK: Jobs importados do sync são apenas registro histórico e nunca devem ser executados
      if (tradeJob.created_by === 'EXCHANGE_SYNC') {
        this.logger.warn(`[SEGURANÇA] Trade job ${tradeJobId} criado por EXCHANGE_SYNC - não enfileirando (registro histórico)`);
        return;
      }

      // ✅ HARD-BLOCK: Jobs com order_type='IMPORTED' são registros históricos importados
      // Nunca devem ser enfileirados para execução (camada adicional de segurança)
      if (tradeJob.order_type === 'IMPORTED') {
        this.logger.warn(`[SEGURANÇA] Trade job ${tradeJobId} com order_type=IMPORTED - não enfileirando (registro histórico)`);
        return;
      }

      // ✅ VALIDAÇÃO 1: Verificar se job já está em status final (previne reprocessamento)
      if (FINAL_STATUSES.includes(tradeJob.status as TradeJobStatus)) {
        this.logger.warn(`[SEGURANÇA] Trade job ${tradeJobId} já está em status final (${tradeJob.status}), não enfileirando para evitar reprocessamento`);
        return;
      }

      // ✅ VALIDAÇÃO 2: Verificar se conta de exchange está ativa
      if (!tradeJob.exchange_account.is_active) {
        this.logger.error(`[SEGURANÇA] Trade job ${tradeJobId} - Conta de exchange ${tradeJob.exchange_account_id} está INATIVA, não enfileirando`);
        throw new Error(`Conta de exchange ${tradeJob.exchange_account_id} está inativa`);
      }

      // ✅ VALIDAÇÃO 3: Para SELL, verificar se tem quantidade válida
      if (tradeJob.side === 'SELL') {
        const baseQty = tradeJob.base_quantity?.toNumber() || 0;
        if (baseQty <= 0) {
          this.logger.error(`[SEGURANÇA] Trade job ${tradeJobId} - SELL sem base_quantity válida (${baseQty}), não enfileirando`);
          throw new Error(`SELL job ${tradeJobId} sem base_quantity válida (${baseQty})`);
        }
        this.logger.debug(`[SEGURANÇA] Trade job ${tradeJobId} - SELL validado: base_quantity=${baseQty}`);
      }

      // ✅ VALIDAÇÃO 4: Para BUY, avisar se não tem quantidade (será calculada no executor)
      if (tradeJob.side === 'BUY') {
        const quoteAmount = tradeJob.quote_amount?.toNumber() || 0;
        const baseQty = tradeJob.base_quantity?.toNumber() || 0;
        if (quoteAmount <= 0 && baseQty <= 0) {
          this.logger.warn(`[SEGURANÇA] Trade job ${tradeJobId} - BUY sem quantidade definida, será calculada no executor`);
        }
      }

      // Determinar qual fila usar baseado no trade_mode
      const queue = tradeJob.trade_mode === TradeMode.REAL ? this.realQueue : this.simQueue;
      const queueName = tradeJob.trade_mode === TradeMode.REAL ? 'trade-execution-real' : 'trade-execution-sim';

      // ✅ VALIDAÇÃO 5: Verificar se o job já está enfileirado (evitar duplicatas)
      const existingJobs = await queue.getJobs(['waiting', 'active', 'delayed']);
      const alreadyEnqueued = existingJobs.some(
        (job) => job.data.tradeJobId === tradeJobId
      );

      if (alreadyEnqueued) {
        this.logger.warn(`[SEGURANÇA] Trade job ${tradeJobId} já está enfileirado na fila ${queueName}, não duplicando`);
        return;
      }

      // ✅ Log de segurança antes de enfileirar
      this.logger.log(`[SEGURANÇA] ✅ Trade job ${tradeJobId} passou em todas as validações - enfileirando na fila ${queueName}`);
      this.logger.debug(`[SEGURANÇA] Job ${tradeJobId}: side=${tradeJob.side}, symbol=${tradeJob.symbol}, status=${tradeJob.status}, account=${tradeJob.exchange_account_id}`);

      // Enfileirar o job (BullMQ garante unicidade com jobId)
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
      this.logger.error(`[SEGURANÇA] ❌ Erro ao enfileirar trade job ${tradeJobId}: ${error.message}`, error.stack);
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

