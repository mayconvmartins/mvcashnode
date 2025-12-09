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
    // Usar a mesma função do botão: PositionService.findDustPositions() e convertToDustPosition()
    // Os endpoints /admin/system/identify-dust-positions e /admin/system/convert-to-dust
    // usam exatamente essas mesmas funções internamente
    this.positionService = new PositionService(prisma);
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'dust-positions-monitor';
    this.logger.log('[DUST-POSITIONS-MONITOR] Iniciando identificação e conversão automática de resíduos...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Usar a mesma função do botão: PositionService.findDustPositions()
      // Isso é exatamente o que o endpoint /admin/system/identify-dust-positions faz
      const candidates = await this.positionService.findDustPositions();
      
      this.logger.log(`[DUST-POSITIONS-MONITOR] Encontradas ${candidates.length} posição(ões) candidata(s) a resíduo`);

      if (candidates.length === 0) {
        const result = {
          candidates_found: 0,
          converted: 0,
          new_dust_positions: [],
          errors: 0,
        };
        
        const durationMs = Date.now() - startTime;
        await this.cronExecutionService.recordExecution(
          jobName,
          CronExecutionStatus.SUCCESS,
          durationMs,
          result
        );
        
        this.logger.log('[DUST-POSITIONS-MONITOR] Nenhuma posição candidata a resíduo encontrada');
        return result;
      }

      // Converter automaticamente todas as candidatas identificadas
      // Usar a mesma função do botão: PositionService.convertToDustPosition()
      // Isso é exatamente o que o endpoint /admin/system/convert-to-dust faz
      this.logger.log(`[DUST-POSITIONS-MONITOR] Convertendo automaticamente ${candidates.length} posição(ões) candidata(s)...`);

      let converted = 0;
      let errors = 0;
      const errorDetails: Array<{ positionId: number; error: string }> = [];
      const newDustPositions: number[] = [];

      // Converter candidatas para resíduo usando a mesma função do endpoint
      for (const candidate of candidates) {
        try {
          // Usar a mesma função que o botão usa: convertToDustPosition()
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
