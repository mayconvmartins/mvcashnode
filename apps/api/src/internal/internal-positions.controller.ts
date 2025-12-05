import {
  Controller,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType } from '@mvcashnode/shared';
import { PositionService } from '@mvcashnode/domain';
import { ConfigService } from '@nestjs/config';

/**
 * Controller interno para sincronização de posições
 * Não requer autenticação JWT, usado por serviços internos (monitors)
 */
@ApiTags('Internal')
@Controller('internal/positions')
export class InternalPositionsController {
  private encryptionService: EncryptionService;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
    }
    this.encryptionService = new EncryptionService(key);
  }

  @Post('sync-missing-all')
  @ApiOperation({
    summary: 'Sincronizar posições faltantes para todos os usuários (Interno)',
    description: 'Endpoint interno chamado pelo monitor para sincronizar posições faltantes',
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronização concluída',
  })
  async syncMissingPositionsAll(): Promise<any> {
    console.log(`[SYNC-MISSING-ALL] Iniciando sincronização de posições faltantes para todos os usuários`);
    
    try {
      // Buscar todos os usuários ativos
      const users = await this.prisma.user.findMany({
        where: {
          is_active: true,
        },
        select: {
          id: true,
        },
      });

      console.log(`[SYNC-MISSING-ALL] Encontrados ${users.length} usuário(s) ativo(s)`);

      let totalChecked = 0;
      let totalPositionsCreated = 0;
      let totalExecutionsUpdated = 0;
      const allErrors: Array<{ userId: number; jobId: number; error: string }> = [];

      // Processar cada usuário
      for (const user of users) {
        try {
          // Buscar IDs das exchange accounts do usuário
          const userAccounts = await this.prisma.exchangeAccount.findMany({
            where: { user_id: user.id },
            select: { id: true },
          });

          const accountIds = userAccounts.map((acc) => acc.id);

          if (accountIds.length === 0) {
            continue;
          }

          // Buscar jobs BUY FILLED sem posição associada
          const jobsWithoutPosition = await this.prisma.tradeJob.findMany({
            where: {
              exchange_account_id: { in: accountIds },
              side: 'BUY',
              status: 'FILLED',
              position_open: null,
            },
            include: {
              exchange_account: {
                select: {
                  id: true,
                  exchange: true,
                  is_simulation: true,
                  testnet: true,
                },
              },
              executions: {
                orderBy: {
                  created_at: 'desc',
                },
                take: 1,
              },
            },
          });

          // Filtrar jobs que já estão em PositionGroupedJob (já foram agrupados)
          const groupedJobIds = await this.prisma.positionGroupedJob.findMany({
            select: { trade_job_id: true },
          });
          const groupedJobIdsSet = new Set(groupedJobIds.map(gj => gj.trade_job_id));
          
          // Filtrar jobs que não estão agrupados
          const jobsToProcess = jobsWithoutPosition.filter(job => !groupedJobIdsSet.has(job.id));
          
          totalChecked += jobsWithoutPosition.length;
          const skippedGrouped = jobsWithoutPosition.length - jobsToProcess.length;
          
          if (skippedGrouped > 0) {
            console.log(`[SYNC-MISSING-ALL] Usuário ${user.id}: ${skippedGrouped} job(s) ignorado(s) (já agrupado(s))`);
          }

          let positionsCreated = 0;
          let executionsUpdated = 0;

          for (const job of jobsToProcess) {
            try {
              let execution = job.executions[0];
              let shouldUpdateExecution = false;
              let finalExecutedQty = execution?.executed_qty?.toNumber() || 0;
              let finalAvgPrice = execution?.avg_price?.toNumber() || 0;
              let finalCummQuoteQty = execution?.cumm_quote_qty?.toNumber() || 0;

              const needsExchangeCheck = !execution || 
                                       (execution && execution.exchange_order_id && (finalExecutedQty === 0 || finalAvgPrice === 0));

              if (needsExchangeCheck) {
                if (job.exchange_account.is_simulation) {
                  allErrors.push({
                    userId: user.id,
                    jobId: job.id,
                    error: 'Job de simulação sem execução válida',
                  });
                  continue;
                }

                const exchangeOrderId = execution?.exchange_order_id;
                if (!exchangeOrderId) {
                  allErrors.push({
                    userId: user.id,
                    jobId: job.id,
                    error: 'Job sem exchange_order_id para verificar na exchange',
                  });
                  continue;
                }

                try {
                  const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
                  const keys = await accountService.decryptApiKeys(job.exchange_account_id);

                  if (!keys || !keys.apiKey || !keys.apiSecret) {
                    allErrors.push({
                      userId: user.id,
                      jobId: job.id,
                      error: 'API keys não encontradas',
                    });
                    continue;
                  }

                  const adapter = AdapterFactory.createAdapter(
                    job.exchange_account.exchange as ExchangeType,
                    keys.apiKey,
                    keys.apiSecret,
                    { testnet: job.exchange_account.testnet }
                  );

                  let order;
                  if (job.exchange_account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
                    order = await adapter.fetchClosedOrder(exchangeOrderId, job.symbol);
                  } else {
                    order = await adapter.fetchOrder(exchangeOrderId, job.symbol);
                  }

                  let updatedFilled = order.filled || 0;
                  let updatedAverage = order.average || order.price || 0;
                  let updatedCost = order.cost || 0;

                  if ((updatedFilled === 0 || updatedAverage === 0) && order.fills && order.fills.length > 0) {
                    let totalFilled = 0;
                    let totalCost = 0;

                    for (const fill of order.fills) {
                      const fillQty = fill.amount || fill.quantity || 0;
                      const fillPrice = fill.price || 0;
                      totalFilled += fillQty;
                      totalCost += fillQty * fillPrice;
                    }

                    if (totalFilled > 0) {
                      updatedFilled = totalFilled;
                      updatedAverage = totalCost / totalFilled;
                      updatedCost = totalCost;
                    }
                  }

                  if (updatedFilled > 0 && updatedAverage > 0) {
                    finalExecutedQty = updatedFilled;
                    finalAvgPrice = updatedAverage;
                    finalCummQuoteQty = updatedCost > 0 ? updatedCost : (updatedFilled * updatedAverage);
                    shouldUpdateExecution = true;
                  }
                } catch (exchangeError: any) {
                  allErrors.push({
                    userId: user.id,
                    jobId: job.id,
                    error: `Erro ao verificar na exchange: ${exchangeError.message}`,
                  });
                  continue;
                }
              }

              if (finalExecutedQty === 0 || finalAvgPrice === 0) {
                allErrors.push({
                  userId: user.id,
                  jobId: job.id,
                  error: 'Execução sem quantidade ou preço válido',
                });
                continue;
              }

              if (shouldUpdateExecution && execution) {
                await this.prisma.tradeExecution.update({
                  where: { id: execution.id },
                  data: {
                    executed_qty: finalExecutedQty,
                    avg_price: finalAvgPrice,
                    cumm_quote_qty: finalCummQuoteQty,
                    status_exchange: 'FILLED',
                  },
                });
                executionsUpdated++;
              }

              const positionService = new PositionService(this.prisma);
              const executionId = execution?.id;
              
              if (!executionId) {
                const newExecution = await this.prisma.tradeExecution.create({
                  data: {
                    trade_job_id: job.id,
                    exchange_account_id: job.exchange_account_id,
                    trade_mode: job.trade_mode,
                    exchange: job.exchange_account.exchange,
                    exchange_order_id: execution?.exchange_order_id || `SYNC-${job.id}`,
                    client_order_id: `sync-${job.id}-${Date.now()}`,
                    status_exchange: 'FILLED',
                    executed_qty: finalExecutedQty,
                    cumm_quote_qty: finalCummQuoteQty,
                    avg_price: finalAvgPrice,
                  },
                });
                
                await positionService.onBuyExecuted(
                  job.id,
                  newExecution.id,
                  finalExecutedQty,
                  finalAvgPrice
                );
              } else {
                await positionService.onBuyExecuted(
                  job.id,
                  executionId,
                  finalExecutedQty,
                  finalAvgPrice
                );
              }

              positionsCreated++;
            } catch (error: any) {
              allErrors.push({
                userId: user.id,
                jobId: job.id,
                error: error.message || 'Erro desconhecido',
              });
            }
          }

          totalPositionsCreated += positionsCreated;
          totalExecutionsUpdated += executionsUpdated;
        } catch (error: any) {
          console.error(`[SYNC-MISSING-ALL] Erro ao processar usuário ${user.id}:`, error.message);
        }
      }

      console.log(`[SYNC-MISSING-ALL] Sincronização concluída: ${totalPositionsCreated} posição(ões) criada(s), ${totalExecutionsUpdated} execução(ões) atualizada(s), ${allErrors.length} erro(s)`);

      return {
        total_users: users.length,
        total_checked: totalChecked,
        positions_created: totalPositionsCreated,
        executions_updated: totalExecutionsUpdated,
        errors: allErrors,
      };
    } catch (error: any) {
      console.error(`[SYNC-MISSING-ALL] Erro geral na sincronização:`, error.message);
      console.error(`[SYNC-MISSING-ALL] Stack:`, error.stack);
      throw error;
    }
  }
}

