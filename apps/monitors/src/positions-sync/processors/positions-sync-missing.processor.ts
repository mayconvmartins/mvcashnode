import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('positions-sync-missing')
export class PositionsSyncMissingProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsSyncMissingProcessor.name);
  private apiUrl: string;
  private adminToken: string | null = null;

  constructor(
    private cronExecutionService: CronExecutionService
  ) {
    super();
    this.apiUrl = process.env.API_URL || 'http://localhost:4010';
    // Token de admin para autenticação (pode ser gerado ou configurado via env)
    this.adminToken = process.env.ADMIN_SYSTEM_TOKEN || null;
    
    if (!this.adminToken) {
      this.logger.warn('[POSITIONS-SYNC-MISSING] ADMIN_SYSTEM_TOKEN não configurado. O cron pode falhar se o endpoint exigir autenticação.');
    }
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'positions-sync-missing';
    this.logger.log('[POSITIONS-SYNC-MISSING] Iniciando sincronização de posições faltantes...');

    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Chamar endpoint HTTP usando fetch nativo
      const url = `${this.apiUrl}/positions/sync-missing-all`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Adicionar token de admin se disponível
      if (this.adminToken) {
        headers['Authorization'] = `Bearer ${this.adminToken}`;
      }

      controller = new AbortController();
      timeoutId = setTimeout(() => controller!.abort(), 300000); // 5 minutos de timeout

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Erro desconhecido');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const durationMs = Date.now() - startTime;

      // Log resumido para economizar memória
      this.logger.log(
        `[POSITIONS-SYNC-MISSING] Concluído: ${result.positions_created || 0} posições, ${result.executions_updated || 0} execuções, ${durationMs}ms`
      );

      // Registrar sucesso (sem armazenar resultado completo para economizar memória)
      const summaryResult = {
        total_users: result.total_users,
        total_checked: result.total_checked,
        positions_created: result.positions_created,
        executions_updated: result.executions_updated,
        errors_count: result.errors?.length || 0,
      };

      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        summaryResult
      );

      // Limpar referências
      controller = null;

      return summaryResult;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(
        `[POSITIONS-SYNC-MISSING] Erro: ${errorMessage}`
      );

      // Limpar timeout se ainda estiver ativo
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      controller = null;

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

