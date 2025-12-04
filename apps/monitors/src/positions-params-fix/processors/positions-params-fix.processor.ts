import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { PositionStatus } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('positions-params-fix')
export class PositionsParamsFixProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsParamsFixProcessor.name);
  private positionService: PositionService;

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService
  ) {
    super();
    this.positionService = new PositionService(prisma);
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'positions-params-fix';
    this.logger.log('[POSITIONS-PARAMS-FIX] Iniciando correção de parâmetros faltantes...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Calcular data limite: 2 minutos atrás
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

      // Buscar posições abertas sem min_profit_pct criadas há menos de 2 minutos
      const positions = await this.prisma.tradePosition.findMany({
        where: {
          status: PositionStatus.OPEN,
          min_profit_pct: null,
          created_at: {
            gte: twoMinutesAgo,
          },
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              exchange: true,
            },
          },
        },
      });

      this.logger.log(`[POSITIONS-PARAMS-FIX] Encontradas ${positions.length} posição(ões) sem min_profit_pct criadas há menos de 2 minutos`);

      let updated = 0;
      let errors = 0;

      for (const position of positions) {
        try {
          // Usar a função de validação e atualização do PositionService
          // Como a função é privada, vamos criar uma função pública ou usar uma abordagem diferente
          // Vou criar uma função pública no PositionService para isso
          const wasUpdated = await this.positionService.validateAndUpdatePositionParamsPublic(
            position.id,
            position.exchange_account_id,
            position.symbol
          );

          if (wasUpdated) {
            updated++;
            this.logger.debug(`[POSITIONS-PARAMS-FIX] ✅ Posição ${position.id} atualizada com sucesso`);
          } else {
            this.logger.debug(`[POSITIONS-PARAMS-FIX] ℹ️ Posição ${position.id} não precisou de atualização`);
          }
        } catch (error: any) {
          errors++;
          this.logger.error(`[POSITIONS-PARAMS-FIX] ❌ Erro ao atualizar posição ${position.id}: ${error.message}`);
        }
      }

      const result = {
        positions_checked: positions.length,
        positions_updated: updated,
        errors,
      };

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `[POSITIONS-PARAMS-FIX] Concluído: ${updated} posição(ões) atualizada(s), ${errors} erro(s), ${durationMs}ms`
      );

      // Registrar sucesso
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        result
      );

      return result;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(
        `[POSITIONS-PARAMS-FIX] Erro ao corrigir parâmetros: ${errorMessage}`,
        error.stack
      );

      // Registrar falha
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.FAILED,
        durationMs,
        null,
        errorMessage
      );

      throw error;
    }
  }
}

