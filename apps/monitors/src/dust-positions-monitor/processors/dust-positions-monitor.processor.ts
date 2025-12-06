import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('dust-positions-monitor')
export class DustPositionsMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(DustPositionsMonitorProcessor.name);
  private positionService: PositionService;

  constructor(
    prisma: PrismaService,
    private cronExecutionService: CronExecutionService
  ) {
    super();
    this.positionService = new PositionService(prisma);
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'dust-positions-monitor';
    this.logger.log('[DUST-POSITIONS-MONITOR] Iniciando identificação e conversão de resíduos...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Identificar posições candidatas a resíduo
      const candidates = await this.positionService.findDustPositions();
      
      this.logger.log(`[DUST-POSITIONS-MONITOR] Encontradas ${candidates.length} posição(ões) candidata(s) a resíduo`);

      let converted = 0;
      let errors = 0;
      const errorDetails: Array<{ positionId: number; error: string }> = [];
      const newDustPositions: number[] = [];

      // Converter candidatas para resíduo
      for (const candidate of candidates) {
        try {
          const newDustPositionId = await this.positionService.convertToDustPosition(candidate.positionId);
          newDustPositions.push(newDustPositionId);
          converted++;
          this.logger.log(
            `[DUST-POSITIONS-MONITOR] ✅ Posição ${candidate.positionId} convertida para resíduo (nova posição: ${newDustPositionId})`
          );
        } catch (error: any) {
          errors++;
          const errorMsg = error.message || 'Erro desconhecido';
          errorDetails.push({
            positionId: candidate.positionId,
            error: errorMsg,
          });
          this.logger.error(
            `[DUST-POSITIONS-MONITOR] ❌ Erro ao converter posição ${candidate.positionId}: ${errorMsg}`
          );
        }
      }

      const result = {
        candidates_found: candidates.length,
        converted,
        new_dust_positions: newDustPositions,
        errors,
        error_details: errorDetails.length > 0 ? errorDetails : undefined,
      };

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `[DUST-POSITIONS-MONITOR] Concluído: ${converted}/${candidates.length} posição(ões) convertida(s), ${errors} erro(s), ${durationMs}ms`
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
        `[DUST-POSITIONS-MONITOR] Erro ao processar resíduos: ${errorMessage}`,
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
