import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import {
  PositionService,
  ExchangeAccountService,
  VaultService,
  TradeParameterService,
} from '@mvcashnode/domain';
import { EncryptionService, getBaseAsset, getQuoteAsset } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus, TradeMode } from '@mvcashnode/shared';
import { NotificationHttpService } from '@mvcashnode/notifications';

@Processor('trade-execution-real')
export class TradeExecutionRealProcessor extends WorkerHost {
  private readonly logger = new Logger(TradeExecutionRealProcessor.name);
  private notificationService: NotificationHttpService;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
    this.notificationService = new NotificationHttpService(process.env.API_URL || 'http://localhost:4010');
  }

  /**
   * ✅ BUG-ALTO-003 FIX: Helper para retry de operações de rede com backoff exponencial
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || 'Erro desconhecido';
        const errorCode = error?.code || error?.statusCode || '';
        
        // Verificar se é erro de rede
        const isNetworkError = 
          errorMessage.includes('timeout') || 
          errorMessage.includes('network') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorCode === 'ETIMEDOUT' ||
          errorCode === 'ENOTFOUND' ||
          errorCode === 'ECONNRESET' ||
          errorCode === 'ECONNREFUSED';
        
        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          this.logger.warn(
            `[EXECUTOR] Erro de rede em ${operationName} (tentativa ${attempt}/${maxRetries}). ` +
            `Aguardando ${delay}ms antes de tentar novamente...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        
        // Se não for erro de rede ou esgotou tentativas, lançar erro
        throw error;
      }
    }
    
    throw lastError;
  }


  async process(job: Job<any>): Promise<any> {
    const { tradeJobId } = job.data;
    const startTime = Date.now();

    this.logger.log(`[EXECUTOR] Processando trade job ${tradeJobId}`);

    try {
      const tradeJob = await this.prisma.tradeJob.findUnique({
        where: { id: tradeJobId },
        include: {
          exchange_account: true,
        },
      });

      if (!tradeJob) {
        throw new Error(`Trade job ${tradeJobId} não encontrado`);
      }

      // ✅ CRITICAL FIX: Verificar se job já foi processado (previne reprocessamento)
      const finalStatuses: string[] = [
        TradeJobStatus.FILLED,
        TradeJobStatus.PARTIALLY_FILLED,
        TradeJobStatus.SKIPPED,
        TradeJobStatus.FAILED,
        TradeJobStatus.CANCELED,
      ];
      
      if (finalStatuses.includes(tradeJob.status as string)) {
        this.logger.warn(`[EXECUTOR] Job ${tradeJobId} já foi processado (status: ${tradeJob.status}), ignorando para evitar reprocessamento`);
        return {
          success: false,
          alreadyProcessed: true,
          status: tradeJob.status,
        };
      }

      // Log para debug de jobs PENDING_LIMIT
      if (tradeJob.status === TradeJobStatus.PENDING_LIMIT) {
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Status PENDING_LIMIT detectado, processando...`);
      }

      // ✅ CRITICAL FIX: Marcar como EXECUTING IMEDIATAMENTE (lock de processamento)
      // Isso previne múltiplos processors processando o mesmo job simultaneamente
      if (tradeJob.status !== TradeJobStatus.EXECUTING) {
        try {
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: { status: TradeJobStatus.EXECUTING },
          });
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} marcado como EXECUTING (lock de processamento)`);
        } catch (updateError: any) {
          // Se falhar ao atualizar, pode ser race condition - verificar status novamente
          const recheckJob = await this.prisma.tradeJob.findUnique({
            where: { id: tradeJobId },
            select: { status: true },
          });
          
          if (recheckJob && finalStatuses.includes(recheckJob.status as string)) {
            this.logger.warn(`[EXECUTOR] Job ${tradeJobId} foi processado por outro worker (status: ${recheckJob.status}), abortando`);
            return {
              success: false,
              alreadyProcessed: true,
              status: recheckJob.status,
            };
          }
          
          // Se não for status final, continuar (pode ser apenas conflito de atualização)
          this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - Erro ao marcar como EXECUTING, mas continuando: ${updateError?.message}`);
        }
      }

      if (tradeJob.trade_mode !== 'REAL') {
        throw new Error(`Trade job ${tradeJobId} não é do modo REAL`);
      }

      // Validar que a exchange account está ativa
      if (!tradeJob.exchange_account.is_active) {
        throw new Error(`Conta de exchange ${tradeJob.exchange_account_id} está inativa`);
      }

      // Validar símbolo
      if (!tradeJob.symbol || tradeJob.symbol.trim() === '') {
        throw new Error(`Símbolo inválido para trade job ${tradeJobId}`);
      }

      // ============================================
      // VALIDAÇÃO E BUSCA DE QUANTIDADE
      // ============================================
      // Log crítico logo após ler do banco
      this.logger.log(`[EXECUTOR] Job ${tradeJobId} - DADOS DO BANCO: side="${tradeJob.side}", symbol="${tradeJob.symbol}", base_quantity=${tradeJob.base_quantity?.toNumber() ?? 'null'}, quote_amount=${tradeJob.quote_amount?.toNumber() ?? 'null'}`);

      // Normalizar side ANTES de qualquer processamento
      const side = (tradeJob.side || '').toUpperCase().trim();
      this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Side normalizado: "${side}"`);

      // Extrair e validar quantidades do banco
      let baseQty = 0;
      let quoteAmount = 0;

      if (tradeJob.base_quantity) {
        const rawBaseQty = tradeJob.base_quantity.toNumber();
        baseQty = isNaN(rawBaseQty) ? 0 : Number(rawBaseQty);
      }

      if (tradeJob.quote_amount) {
        const rawQuoteAmount = tradeJob.quote_amount.toNumber();
        quoteAmount = isNaN(rawQuoteAmount) ? 0 : Number(rawQuoteAmount);
      }

      this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Quantidades extraídas: baseQty=${baseQty}, quoteAmount=${quoteAmount}`);

      // Verificar se precisa buscar quantidade
      const needsQuantity = baseQty <= 0 && quoteAmount <= 0;
      const isBuy = side === 'BUY';
      const isSell = side === 'SELL';

      this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Análise: needsQuantity=${needsQuantity}, isBuy=${isBuy}, isSell=${isSell}`);

      // BUSCAR QUANTIDADE PARA BUY
      if (needsQuantity && isBuy) {
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - BUY sem quantidade, buscando dos parâmetros...`);
        
        try {
          const tradeParameterService = new TradeParameterService(this.prisma);
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Chamando computeQuoteAmount(accountId=${tradeJob.exchange_account_id}, symbol="${tradeJob.symbol}", side="${side}", mode="${tradeJob.trade_mode}")`);
          
          quoteAmount = await tradeParameterService.computeQuoteAmount(
            tradeJob.exchange_account_id,
            tradeJob.symbol,
            side as 'BUY' | 'SELL',
            tradeJob.trade_mode as TradeMode
          );
          
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - computeQuoteAmount retornou: ${quoteAmount}`);

          // Validar quantidade calculada
          if (!quoteAmount || isNaN(quoteAmount) || quoteAmount <= 0) {
            throw new Error(`Quantidade calculada é inválida: ${quoteAmount}`);
          }

          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Quantidade válida calculada: ${quoteAmount} USDT`);
          
          // Atualizar job no banco
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: { quote_amount: quoteAmount },
          });
          
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Job atualizado com quote_amount=${quoteAmount}`);
        } catch (error: any) {
          const errorMessage = error?.message || 'Erro desconhecido';
          this.logger.error(`[EXECUTOR] Job ${tradeJobId} - ERRO ao buscar quantidade dos parâmetros: ${errorMessage}`);
          this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Stack: ${error?.stack}`);
          
          // Determinar reason_code
          let reasonCode = 'MISSING_TRADE_PARAMETER';
          let reasonMessage = errorMessage;

          if (errorMessage.includes('not found') || errorMessage.includes('Trade parameter not found')) {
            reasonCode = 'MISSING_TRADE_PARAMETER';
            reasonMessage = `Parâmetro de trade não encontrado para conta ${tradeJob.exchange_account_id}, símbolo ${tradeJob.symbol}, lado ${side}`;
          } else if (errorMessage.includes('Balance not found')) {
            reasonCode = 'BALANCE_NOT_FOUND';
            reasonMessage = `Saldo não encontrado para calcular quantidade (conta ${tradeJob.exchange_account_id}, modo ${tradeJob.trade_mode})`;
          } else if (errorMessage.includes('No quote amount configuration')) {
            reasonCode = 'INVALID_TRADE_PARAMETER';
            reasonMessage = `Parâmetro de trade encontrado mas sem configuração de quantidade`;
          } else if (errorMessage.includes('inválida') || errorMessage.includes('inválido')) {
            reasonCode = 'INVALID_QUANTITY_CALCULATED';
            reasonMessage = `Quantidade calculada é inválida: ${errorMessage}`;
          }
          
          // Marcar job como FAILED
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.FAILED,
              reason_code: reasonCode,
              reason_message: reasonMessage,
            },
          });
          
          throw new Error(`Quantidade inválida para trade job ${tradeJobId}: ${reasonMessage}`);
        }
      }

      // BUSCAR QUANTIDADE PARA SELL
      if (needsQuantity && isSell) {
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - SELL sem quantidade, buscando da posição aberta...`);
        
        try {
          const openPosition = await this.prisma.tradePosition.findFirst({
            where: {
              exchange_account_id: tradeJob.exchange_account_id,
              symbol: tradeJob.symbol,
              trade_mode: tradeJob.trade_mode,
              status: 'OPEN',
              qty_remaining: { gt: 0 },
              lock_sell_by_webhook: false,
            },
            orderBy: {
              created_at: 'asc',
            },
          });

          if (openPosition) {
            baseQty = openPosition.qty_remaining.toNumber();
            this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Posição encontrada: ID=${openPosition.id}, qty=${baseQty}`);
            
            await this.prisma.tradeJob.update({
              where: { id: tradeJobId },
              data: { base_quantity: baseQty },
            });
          } else {
            this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - Nenhuma posição aberta encontrada para vender`);
            await this.prisma.tradeJob.update({
              where: { id: tradeJobId },
              data: {
                status: TradeJobStatus.SKIPPED,
                reason_code: 'NO_ELIGIBLE_POSITIONS',
                reason_message: `Nenhuma posição aberta encontrada para vender ${tradeJob.symbol}`,
              },
            });
            return {
              success: false,
              skipped: true,
              reason: 'NO_ELIGIBLE_POSITIONS',
              message: 'Nenhuma posição aberta encontrada para vender',
            };
          }
        } catch (error: any) {
          this.logger.error(`[EXECUTOR] Job ${tradeJobId} - ERRO ao buscar posição: ${error.message}`);
          throw new Error(`Quantidade inválida para trade job ${tradeJobId} e não foi possível buscar posição aberta: ${error.message}`);
        }
      }

      // VALIDAÇÃO FINAL
      this.logger.log(`[EXECUTOR] Job ${tradeJobId} - VALIDAÇÃO FINAL: side="${side}", baseQty=${baseQty}, quoteAmount=${quoteAmount}`);
      
      if (baseQty <= 0 && quoteAmount <= 0) {
        const errorMsg = `Quantidade inválida para trade job ${tradeJobId}. Side: "${side}", baseQty: ${baseQty}, quoteAmount: ${quoteAmount}`;
        this.logger.error(`[EXECUTOR] Job ${tradeJobId} - ${errorMsg}`);
        this.logger.error(`[EXECUTOR] Job ${tradeJobId} - O código não conseguiu obter quantidade válida. Verifique os logs acima.`);
        
        // Marcar como FAILED
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: {
            status: TradeJobStatus.FAILED,
            reason_code: 'INVALID_QUANTITY',
            reason_message: errorMsg,
          },
        });
        
        throw new Error(errorMsg);
      }
      
      this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Quantidade validada com sucesso: baseQty=${baseQty}, quoteAmount=${quoteAmount}`);

      // Status já foi atualizado para EXECUTING no início (lock de processamento)

      // Get API keys
      const accountService = new ExchangeAccountService(
        this.prisma,
        this.encryptionService
      );
      const keys = await accountService.decryptApiKeys(tradeJob.exchange_account_id);

      if (!keys || !keys.apiKey || !keys.apiSecret) {
        throw new Error(`API keys não encontradas para conta ${tradeJob.exchange_account_id}`);
      }

      this.logger.debug(`[EXECUTOR] API keys obtidas para conta ${tradeJob.exchange_account_id}`);

      // Create adapter
      const adapter = AdapterFactory.createAdapter(
        tradeJob.exchange_account.exchange as ExchangeType,
        keys.apiKey,
        keys.apiSecret,
        { testnet: tradeJob.exchange_account.testnet }
      );

      // Converter quoteAmount para baseQty se necessário (para MARKET BUY)
      // O CCXT espera amount como quantidade base, não valor em quote
      if (quoteAmount > 0 && baseQty <= 0 && side === 'BUY' && tradeJob.order_type === 'MARKET') {
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Convertendo quoteAmount (${quoteAmount} USDT) para baseQty...`);
        try {
          // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
          const ticker = await this.executeWithRetry(
            () => adapter.fetchTicker(tradeJob.symbol),
            `fetchTicker(${tradeJob.symbol})`,
            3
          );
          const currentPrice = ticker.last;
          
          if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Preço inválido obtido da exchange: ${currentPrice}`);
          }
          
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Preço atual de ${tradeJob.symbol}: ${currentPrice}`);
          
          // Calcular baseQty = quoteAmount / currentPrice
          baseQty = quoteAmount / currentPrice;
          
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - baseQty calculado: ${baseQty} (${quoteAmount} USDT / ${currentPrice})`);
          
          // Validar que baseQty é válido
          if (!baseQty || isNaN(baseQty) || baseQty <= 0) {
            throw new Error(`baseQty calculado é inválido: ${baseQty}`);
          }
          
          // Atualizar job com baseQty calculado
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: { base_quantity: baseQty },
          });
          
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Job atualizado com base_quantity=${baseQty}`);
        } catch (error: any) {
          const errorMessage = error?.message || 'Erro desconhecido';
          this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Erro ao converter quoteAmount para baseQty: ${errorMessage}`);
          
          // Marcar job como FAILED
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.FAILED,
              reason_code: 'PRICE_FETCH_ERROR',
              reason_message: `Erro ao buscar preço para converter quoteAmount: ${errorMessage}`,
            },
          });
          
          throw new Error(`Erro ao converter quoteAmount para baseQty: ${errorMessage}`);
        }
      }

      // Verificar saldo antes de executar
      if (tradeJob.side === 'BUY') {
        try {
          // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
          const balance = await this.executeWithRetry(
            () => adapter.fetchBalance(),
            'fetchBalance()',
            3
          );
          const quoteAsset = getQuoteAsset(tradeJob.symbol);
          const available = balance.free[quoteAsset] || 0;

          const requiredAmount = quoteAmount > 0 ? quoteAmount : baseQty * (tradeJob.limit_price?.toNumber() || 0);

          if (available < requiredAmount) {
            throw new Error(`Saldo insuficiente. Disponível: ${available} ${quoteAsset}, Necessário: ${requiredAmount} ${quoteAsset}`);
          }

          this.logger.debug(`[EXECUTOR] Saldo verificado: ${available} ${quoteAsset} disponível`);
        } catch (error: any) {
          // Se falhar ao verificar saldo, logar mas continuar (pode ser problema de API)
          this.logger.warn(`[EXECUTOR] Aviso: Não foi possível verificar saldo: ${error.message}`);
        }
      } else if (tradeJob.side === 'SELL') {
        // ✅ NOVO: Para SELL, sempre buscar saldo atualizado da exchange antes de executar
        try {
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Buscando saldo atualizado da exchange para venda...`);
          
          // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
          const balance = await this.executeWithRetry(
            () => adapter.fetchBalance(),
            'fetchBalance()',
            3
          );
          const baseAsset = getBaseAsset(tradeJob.symbol);
          const available = balance.free[baseAsset] || 0;
          
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Saldo disponível na exchange: ${available} ${baseAsset}, Quantidade solicitada: ${baseQty} ${baseAsset}`);
          
          // Atualizar cache de saldo
          const accountService = new ExchangeAccountService(
            this.prisma,
            this.encryptionService
          );
          const balances: Record<string, { free: number; locked: number }> = {};
          for (const [asset, amount] of Object.entries(balance.free || {})) {
            balances[asset] = {
              free: amount,
              locked: balance.used?.[asset] || 0,
            };
          }
          await accountService.syncBalance(
            tradeJob.exchange_account_id,
            tradeJob.trade_mode as TradeMode,
            balances
          );
          
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Cache de saldo atualizado`);
          
          // Validar quantidade vs disponível
          if (baseQty > available) {
            if (available > 0) {
              // Ajustar quantidade para o disponível (qualquer valor acima de zero)
              this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - Quantidade solicitada (${baseQty}) > disponível (${available}). Ajustando para ${available}`);
              
              // Adicionar warning se quantidade ajustada for muito pequena
              if (available < 0.001) {
                this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - ⚠️ Quantidade ajustada é muito pequena (${available} ${baseAsset}). A exchange pode rejeitar a ordem.`);
              }
              
              baseQty = available;
              
              // Atualizar job no banco
              await this.prisma.tradeJob.update({
                where: { id: tradeJobId },
                data: { base_quantity: baseQty },
              });
            } else {
              // Saldo zero, falhar
              throw new Error(`Saldo insuficiente na exchange. Disponível: ${available} ${baseAsset}`);
            }
          }
          
          this.logger.debug(`[EXECUTOR] Saldo verificado para venda: ${available} ${baseAsset} disponível, quantidade a vender: ${baseQty} ${baseAsset}`);
        } catch (error: any) {
          this.logger.error(`[EXECUTOR] Erro ao verificar/atualizar saldo para venda: ${error.message}`);
          // Para vendas, é crítico ter saldo correto, então lançar erro
          throw error;
        }
      }

      // ✅ CRITICAL FIX: Validar posição ANTES de criar ordem na exchange (previne ordens inválidas)
      if (tradeJob.position_id_to_close && isSell) {
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Validando posição ${tradeJob.position_id_to_close} antes de criar ordem...`);
        
        const targetPosition = await this.prisma.tradePosition.findUnique({
          where: { id: tradeJob.position_id_to_close },
        });
        
        if (!targetPosition) {
          this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Posição ${tradeJob.position_id_to_close} não encontrada`);
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.SKIPPED,
              reason_code: 'POSITION_NOT_ELIGIBLE',
              reason_message: `Position ${tradeJob.position_id_to_close} not found`,
            },
          });

          // ✅ NOVO: Limpar flags da posição para permitir nova tentativa (se posição existir)
          if (tradeJob.position_id_to_close) {
            try {
              await this.prisma.tradePosition.update({
                where: { id: tradeJob.position_id_to_close },
                data: {
                  tp_triggered: false,
                  sl_triggered: false,
                  trailing_triggered: false,
                },
              });
              this.logger.log(`[EXECUTOR] Flags de trigger limpas na posição ${tradeJob.position_id_to_close} após job ${tradeJobId} ser marcado como SKIPPED (POSITION_NOT_FOUND)`);
            } catch (error: any) {
              // Se posição não existe, não há flags para limpar
              this.logger.debug(`[EXECUTOR] Não foi possível limpar flags da posição ${tradeJob.position_id_to_close} (posição não existe)`);
            }
          }

          return {
            success: false,
            skipped: true,
            reason: 'POSITION_NOT_ELIGIBLE',
            message: `Position ${tradeJob.position_id_to_close} not found`,
          };
        }
        
        // ✅ DEBUG: Logs detalhados de validação de elegibilidade
        this.logger.log(`[EXECUTOR] ========== VALIDAÇÃO DE ELEGIBILIDADE - Posição ${targetPosition.id} ==========`);
        this.logger.log(`[EXECUTOR]   - position.exchange_account_id: ${targetPosition.exchange_account_id} (type: ${typeof targetPosition.exchange_account_id})`);
        this.logger.log(`[EXECUTOR]   - job.exchange_account_id: ${tradeJob.exchange_account_id} (type: ${typeof tradeJob.exchange_account_id})`);
        
        this.logger.log(`[EXECUTOR]   - position.trade_mode: '${targetPosition.trade_mode}' (type: ${typeof targetPosition.trade_mode})`);
        this.logger.log(`[EXECUTOR]   - job.trade_mode: '${tradeJob.trade_mode}' (type: ${typeof tradeJob.trade_mode})`);
        
        this.logger.log(`[EXECUTOR]   - position.symbol: '${targetPosition.symbol}'`);
        this.logger.log(`[EXECUTOR]   - job.symbol: '${tradeJob.symbol}'`);
        
        this.logger.log(`[EXECUTOR]   - position.side: '${targetPosition.side}'`);
        this.logger.log(`[EXECUTOR]   - Expected side: 'LONG'`);
        
        this.logger.log(`[EXECUTOR]   - position.status: '${targetPosition.status}'`);
        this.logger.log(`[EXECUTOR]   - Expected status: 'OPEN'`);
        
        this.logger.log(`[EXECUTOR]   - position.qty_remaining: ${targetPosition.qty_remaining.toNumber()}`);

        // Normalizar valores para comparação type-safe
        const positionAccountId = Number(targetPosition.exchange_account_id);
        const jobAccountId = Number(tradeJob.exchange_account_id);
        
        const positionTradeMode = String(targetPosition.trade_mode).toUpperCase();
        const jobTradeMode = String(tradeJob.trade_mode).toUpperCase();
        
        const positionSymbol = String(targetPosition.symbol).toUpperCase();
        const jobSymbol = String(tradeJob.symbol).toUpperCase();
        
        const positionStatus = String(targetPosition.status).toUpperCase();
        const expectedStatus = 'OPEN';
        
        const qtyRemaining = targetPosition.qty_remaining.toNumber();

        // Validar elegibilidade (com comparações normalizadas)
        const failedChecks: string[] = [];
        
        if (positionAccountId !== jobAccountId) {
          failedChecks.push(`account_id (${positionAccountId} !== ${jobAccountId})`);
        }
        if (positionTradeMode !== jobTradeMode) {
          failedChecks.push(`trade_mode ('${positionTradeMode}' !== '${jobTradeMode}')`);
        }
        if (positionSymbol !== jobSymbol) {
          failedChecks.push(`symbol ('${positionSymbol}' !== '${jobSymbol}')`);
        }
        if (targetPosition.side !== 'LONG') {
          failedChecks.push(`side ('${targetPosition.side}' !== 'LONG')`);
        }
        if (positionStatus !== expectedStatus) {
          failedChecks.push(`status ('${positionStatus}' !== '${expectedStatus}')`);
        }
        if (qtyRemaining <= 0) {
          failedChecks.push(`qty_remaining (${qtyRemaining} <= 0)`);
        }
        
        if (failedChecks.length > 0) {
          this.logger.error(`[EXECUTOR] ❌ Job ${tradeJobId} - Posição ${targetPosition.id} NÃO ELEGÍVEL para fechamento`);
          this.logger.error(`[EXECUTOR] ❌ Falhas na validação: ${failedChecks.join(', ')}`);
          
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.SKIPPED,
              reason_code: 'POSITION_NOT_ELIGIBLE',
              reason_message: `Position ${tradeJob.position_id_to_close} is not eligible for closing. Failed checks: ${failedChecks.join(', ')}`,
            },
          });

          // ✅ NOVO: Limpar flags da posição para permitir nova tentativa
          if (tradeJob.position_id_to_close) {
            await this.prisma.tradePosition.update({
              where: { id: tradeJob.position_id_to_close },
              data: {
                tp_triggered: false,
                sl_triggered: false,
                trailing_triggered: false,
              },
            });
            this.logger.log(`[EXECUTOR] Flags de trigger limpas na posição ${tradeJob.position_id_to_close} após job ${tradeJobId} ser marcado como SKIPPED (POSITION_NOT_ELIGIBLE)`);
          }

          return {
            success: false,
            skipped: true,
            reason: 'POSITION_NOT_ELIGIBLE',
            message: `Position ${tradeJob.position_id_to_close} is not eligible for closing. Failed checks: ${failedChecks.join(', ')}`,
          };
        }
        
        // Verificar lock para webhook
        const isWebhookOrigin = !!tradeJob.webhook_event_id;
        if (isWebhookOrigin && targetPosition.lock_sell_by_webhook) {
          this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Posição ${tradeJob.position_id_to_close} está bloqueada para vendas via webhook`);
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.SKIPPED,
              reason_code: 'WEBHOOK_LOCK',
              reason_message: 'Position is locked for webhook sells',
            },
          });
          return {
            success: false,
            skipped: true,
            reason: 'WEBHOOK_LOCK',
            message: 'Position is locked for webhook sells',
          };
        }
        
        this.logger.log(`[EXECUTOR] ✅ Job ${tradeJobId} - Posição ${targetPosition.id} é ELEGÍVEL para fechamento - todas as validações passaram`);
      }

      // Execute order
      const orderType = tradeJob.order_type === 'LIMIT' ? 'limit' : 'market';
      const orderAmount = baseQty > 0 ? baseQty : quoteAmount;
      this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Criando ordem ${orderType} ${tradeJob.side} ${orderAmount} ${tradeJob.symbol} (baseQty=${baseQty}, quoteAmount=${quoteAmount})`);

      // Para MARKET BUY, sempre usar baseQty (já calculado acima se necessário)
      // Para LIMIT BUY, usar baseQty se disponível, senão usar quoteAmount com limit_price
      const amountToUse = baseQty > 0 ? baseQty : (tradeJob.order_type === 'LIMIT' && tradeJob.limit_price ? quoteAmount / tradeJob.limit_price.toNumber() : 0);
      
      let order;
      let orderCreatedAfterAdjustment = false;
      try {
        if (amountToUse <= 0) {
          throw new Error(`Quantidade inválida para criar ordem: baseQty=${baseQty}, quoteAmount=${quoteAmount}, amountToUse=${amountToUse}`);
        }
        
        // Log informativo sobre quantidade que será enviada
        // A validação real de quantidade mínima será feita pela exchange
        if (amountToUse < 0.001) {
          this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - ⚠️ Quantidade muito pequena: ${amountToUse} ${tradeJob.symbol}. A exchange pode rejeitar se não atender aos requisitos mínimos.`);
        }
        
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Criando ordem na exchange: ${orderType} ${tradeJob.side} amount=${amountToUse} ${tradeJob.symbol}`);
        // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
        order = await this.executeWithRetry(
          () => adapter.createOrder(
            tradeJob.symbol,
            orderType,
            tradeJob.side.toLowerCase(),
            amountToUse,
            tradeJob.limit_price?.toNumber()
          ),
          `createOrder(${tradeJob.symbol})`,
          3
        );

        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Ordem criada na exchange: ${order.id}, status: ${order.status}`);
      } catch (error: any) {
        const errorMessage = error?.message || 'Erro desconhecido';
        const errorCode = error?.code || error?.statusCode || '';
        const errorBody = error?.body || error?.response || '';
        
        this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Erro ao criar ordem na exchange: ${errorMessage}`);
        this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Error code: ${errorCode}, body: ${JSON.stringify(errorBody)}`);
        
        // Mapear erros comuns da Binance e outras exchanges
        let reasonCode = 'EXECUTION_ERROR';
        let reasonMessage = errorMessage;
        
        // Erros de saldo
        if (errorMessage.includes('insufficient balance') || 
            errorMessage.includes('saldo') ||
            errorMessage.includes('Insufficient balance') ||
            errorCode === '-2010' ||
            errorBody?.includes('insufficient balance')) {
          reasonCode = 'INSUFFICIENT_BALANCE';
          reasonMessage = 'Saldo insuficiente na exchange para executar a ordem';
          
          // Para ordens SELL, verificar saldo e ajustar quantidade se necessário
          if (tradeJob.side === 'SELL' && baseQty > 0) {
            try {
              this.logger.log(`[EXECUTOR] Job ${tradeJobId} - SELL com erro INSUFFICIENT_BALANCE, verificando saldo disponível...`);
              
              // Buscar saldo disponível
              // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
          const balance = await this.executeWithRetry(
            () => adapter.fetchBalance(),
            'fetchBalance()',
            3
          );
              const baseAsset = getBaseAsset(tradeJob.symbol);
              const available = balance.free[baseAsset] || 0;
              
              this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Saldo disponível: ${available} ${baseAsset}, Quantidade solicitada: ${baseQty} ${baseAsset}`);
              
              if (available > 0 && available < baseQty) {
                // Ajustar quantidade para o disponível (qualquer valor acima de zero)
                const oldBaseQty = baseQty;
                baseQty = available;
                
                this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Ajustando quantidade de ${oldBaseQty} para ${baseQty} ${baseAsset}`);
                
                // Adicionar warning se quantidade ajustada for muito pequena
                if (available < 0.001) {
                  this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - ⚠️ Quantidade ajustada é muito pequena (${available} ${baseAsset}). A exchange pode rejeitar a ordem.`);
                }
                
                // Atualizar job no banco
                await this.prisma.tradeJob.update({
                  where: { id: tradeJobId },
                  data: { base_quantity: baseQty },
                });
                
                // Atualizar saldo no cache
                const accountService = new ExchangeAccountService(
                  this.prisma,
                  this.encryptionService
                );
                const balances: Record<string, { free: number; locked: number }> = {};
                for (const [asset, amount] of Object.entries(balance.free || {})) {
                  balances[asset] = {
                    free: amount,
                    locked: balance.used?.[asset] || 0,
                  };
                }
                await accountService.syncBalance(
                  tradeJob.exchange_account_id,
                  tradeJob.trade_mode as TradeMode,
                  balances
                );
                
                this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Saldo atualizado no cache, tentando criar ordem novamente com quantidade ajustada...`);
                
                // Recalcular amountToUse com a nova quantidade
                const newAmountToUse = baseQty;
                
                // Tentar criar ordem novamente com quantidade ajustada
                try {
                  // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
                  order = await this.executeWithRetry(
                    () => adapter.createOrder(
                      tradeJob.symbol,
                      orderType,
                      tradeJob.side.toLowerCase(),
                      newAmountToUse,
                      tradeJob.limit_price?.toNumber()
                    ),
                    `createOrder(${tradeJob.symbol}) - retry after balance adjustment`,
                    3
                  );
                  
                  this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Ordem criada com sucesso após ajuste de quantidade: ${order.id}, status: ${order.status}`);
                  
                  // Marcar que a ordem foi criada com sucesso após ajuste
                  orderCreatedAfterAdjustment = true;
                } catch (retryError: any) {
                  const retryErrorMessage = retryError?.message || 'Erro desconhecido';
                  this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Erro ao criar ordem após ajuste de quantidade: ${retryErrorMessage}`);
                  
                  // Capturar erros da exchange sobre quantidade mínima e logar adequadamente
                  if (retryErrorMessage.includes('min notional') || 
                      retryErrorMessage.includes('MIN_NOTIONAL') ||
                      retryErrorMessage.includes('LOT_SIZE') ||
                      retryErrorMessage.includes('minimum amount') ||
                      retryErrorMessage.includes('PRECISION')) {
                    reasonCode = 'MIN_NOTIONAL_NOT_MET';
                    reasonMessage = `A exchange rejeitou a ordem: quantidade muito pequena (${newAmountToUse} ${baseAsset}). Erro: ${retryErrorMessage}`;
                  } else {
                    reasonCode = 'INSUFFICIENT_BALANCE';
                    reasonMessage = `Saldo insuficiente mesmo após ajuste. Disponível: ${available} ${baseAsset}, Tentado: ${newAmountToUse} ${baseAsset}`;
                  }
                  
                  await this.prisma.tradeJob.update({
                    where: { id: tradeJobId },
                    data: {
                      status: TradeJobStatus.FAILED,
                      reason_code: reasonCode,
                      reason_message: reasonMessage,
                    },
                  });
                  
                  throw new Error(`${reasonCode}: ${reasonMessage}`);
                }
              } else if (available === 0) {
                // Saldo zero, marcar como FAILED
                this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - Saldo disponível é zero: ${available} ${baseAsset}`);
                reasonCode = 'INSUFFICIENT_BALANCE';
                reasonMessage = `Saldo insuficiente na exchange. Disponível: ${available} ${baseAsset}`;
                
                await this.prisma.tradeJob.update({
                  where: { id: tradeJobId },
                  data: {
                    status: TradeJobStatus.FAILED,
                    reason_code: reasonCode,
                    reason_message: reasonMessage,
                  },
                });
                
                throw new Error(`${reasonCode}: ${reasonMessage}`);
              } else {
                // available >= baseQty mas ainda deu erro - pode ser outro problema
                this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - Saldo disponível (${available}) >= quantidade solicitada (${baseQty}), mas ainda houve erro. Pode ser problema de precisão ou outra validação da exchange.`);
              }
            } catch (balanceError: any) {
              this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Erro ao verificar/ajustar saldo: ${balanceError.message}`);
              // Continuar com o tratamento normal de erro
            }
          }
        }
        // Erros de rate limit
        else if (errorMessage.includes('rate limit') || 
                 errorMessage.includes('too many requests') ||
                 errorMessage.includes('429') ||
                 errorCode === '-1003' ||
                 errorCode === '429') {
          reasonCode = 'RATE_LIMIT_EXCEEDED';
          reasonMessage = 'Rate limit da exchange excedido. Aguarde alguns segundos e tente novamente';
        }
        // Erros de símbolo inválido
        else if (errorMessage.includes('invalid symbol') || 
                 errorMessage.includes('símbolo inválido') ||
                 errorMessage.includes('Invalid symbol') ||
                 errorCode === '-1121' ||
                 errorBody?.includes('invalid symbol')) {
          reasonCode = 'INVALID_SYMBOL';
          reasonMessage = `Símbolo inválido ou não suportado: ${tradeJob.symbol}`;
        }
        // Erros de quantidade mínima (min notional)
        else if (errorMessage.includes('min notional') || 
                 errorMessage.includes('quantidade mínima') ||
                 errorMessage.includes('MIN_NOTIONAL') ||
                 errorCode === '-1013' ||
                 errorBody?.includes('MIN_NOTIONAL')) {
          reasonCode = 'MIN_NOTIONAL_NOT_MET';
          reasonMessage = 'Quantidade abaixo do valor mínimo permitido pela exchange (min notional)';
        }
        // Erros de quantidade mínima (LOT_SIZE)
        else if (errorMessage.includes('LOT_SIZE') || 
                 errorMessage.includes('lot size') ||
                 errorCode === '-1013' ||
                 errorBody?.includes('LOT_SIZE')) {
          reasonCode = 'INVALID_LOT_SIZE';
          reasonMessage = 'Quantidade não atende aos requisitos de tamanho de lote da exchange';
        }
        // Erros de precisão de quantidade ou quantidade mínima
        else if (errorMessage.includes('PRECISION') || 
                 errorMessage.includes('precision') ||
                 errorMessage.includes('minimum amount precision') ||
                 errorMessage.includes('must be greater than minimum') ||
                 errorCode === '-1013' ||
                 errorBody?.includes('PRECISION') ||
                 errorBody?.includes('minimum amount')) {
          reasonCode = 'INVALID_PRECISION';
          reasonMessage = `Quantidade não atende aos requisitos de precisão mínima da exchange. Quantidade calculada: ${amountToUse}, quoteAmount: ${quoteAmount}, baseQty: ${baseQty}`;
        }
        // Erros de preço
        else if (errorMessage.includes('PRICE') || 
                 errorMessage.includes('price') ||
                 errorCode === '-1013' ||
                 errorBody?.includes('PRICE')) {
          reasonCode = 'INVALID_PRICE';
          reasonMessage = 'Preço inválido ou fora dos limites permitidos pela exchange';
        }
        // Erros de timestamp
        else if (errorMessage.includes('Timestamp') || 
                 errorMessage.includes('timestamp') ||
                 errorMessage.includes('1000ms ahead') ||
                 errorCode === '-1021' ||
                 errorBody?.includes('timestamp')) {
          reasonCode = 'TIMESTAMP_ERROR';
          reasonMessage = 'Erro de sincronização de tempo com a exchange. Verifique o relógio do sistema';
        }
        // Erros de API key
        else if (errorMessage.includes('API-key') || 
                 errorMessage.includes('Invalid API-key') ||
                 errorCode === '-2015' ||
                 errorBody?.includes('API-key')) {
          reasonCode = 'INVALID_API_KEYS';
          reasonMessage = 'API Key inválida ou expirada';
        }
        // Erros de permissão
        else if (errorMessage.includes('Permission') || 
                 errorMessage.includes('permission') ||
                 errorCode === '-2010' ||
                 errorBody?.includes('permission')) {
          reasonCode = 'INSUFFICIENT_PERMISSIONS';
          reasonMessage = 'API Key não tem permissão para executar esta operação';
        }
        // Erros de rede/timeout
        else if (errorMessage.includes('timeout') || 
                 errorMessage.includes('network') ||
                 errorMessage.includes('ETIMEDOUT') ||
                 errorMessage.includes('ENOTFOUND') ||
                 errorCode === 'ETIMEDOUT' ||
                 errorCode === 'ENOTFOUND') {
          reasonCode = 'NETWORK_ERROR';
          reasonMessage = 'Erro de rede ou timeout na comunicação com a exchange';
        }
        // Erros de IP não autorizado
        else if (errorMessage.includes('IP') || 
                 errorMessage.includes('ip') ||
                 errorCode === '-1022' ||
                 errorBody?.includes('IP')) {
          reasonCode = 'IP_NOT_WHITELISTED';
          reasonMessage = 'IP não está na lista de permissões da API Key';
        }
        // Erros de ordem duplicada
        else if (errorMessage.includes('Duplicate') || 
                 errorMessage.includes('duplicate') ||
                 errorCode === '-2010' ||
                 errorBody?.includes('duplicate')) {
          reasonCode = 'DUPLICATE_ORDER';
          reasonMessage = 'Ordem duplicada detectada pela exchange';
        }
        // Erros de mercado fechado
        else if (errorMessage.includes('MARKET_CLOSED') || 
                 errorMessage.includes('market closed') ||
                 errorBody?.includes('MARKET_CLOSED')) {
          reasonCode = 'MARKET_CLOSED';
          reasonMessage = 'Mercado está fechado no momento';
        }
        // Erros genéricos do CCXT
        else if (errorMessage.includes('ExchangeError') || 
                 errorMessage.includes('NetworkError') ||
                 errorMessage.includes('RequestTimeout')) {
          reasonCode = 'EXCHANGE_ERROR';
          reasonMessage = `Erro na comunicação com a exchange: ${errorMessage}`;
        }

        // Se a ordem foi criada com sucesso após ajuste, sair do catch e continuar processamento normal
        if (orderCreatedAfterAdjustment && order) {
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Ordem criada após ajuste, continuando processamento normal...`);
          // Não fazer nada aqui, deixar o código continuar após o catch
        } else {
          // Marcar job como SKIPPED para saldo insuficiente, FAILED para outros erros
          const finalStatus = reasonCode === 'INSUFFICIENT_BALANCE' ? TradeJobStatus.SKIPPED : TradeJobStatus.FAILED;
          const statusLabel = reasonCode === 'INSUFFICIENT_BALANCE' ? 'SKIPPED' : 'FAILED';
          
          try {
            await this.prisma.tradeJob.update({
              where: { id: tradeJobId },
              data: {
                status: finalStatus,
                reason_code: reasonCode,
                reason_message: reasonMessage,
              },
            });
            this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Status atualizado para ${statusLabel} com reason_code: ${reasonCode}`);
          } catch (updateError: any) {
            this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Erro ao atualizar status: ${updateError?.message}`);
          }

          // Para saldo insuficiente, não lançar erro (já foi marcado como SKIPPED)
          // Para outros erros, lançar erro normalmente
          if (reasonCode !== 'INSUFFICIENT_BALANCE') {
            throw new Error(`${reasonCode}: ${reasonMessage}`);
          } else {
            // Retornar sucesso mas com status SKIPPED
            return {
              success: false,
              skipped: true,
              reasonCode,
              reasonMessage,
            };
          }
        }
      }
      
      // Se a ordem foi criada após ajuste, continuar processamento normal
      if (orderCreatedAfterAdjustment && order) {
        // Continuar normalmente, o código abaixo processará a ordem
      }

      // Para ordens LIMIT, verificar se foi preenchida imediatamente
      const isLimitOrder = tradeJob.order_type === 'LIMIT';
      const orderStatus = order.status?.toUpperCase() || '';
      const isOrderFilled = orderStatus === 'FILLED' || orderStatus === 'CLOSED';
      const isOrderNew = orderStatus === 'NEW' || orderStatus === 'OPEN' || orderStatus === 'PENDING';
      const isOrderPartiallyFilled = orderStatus === 'PARTIALLY_FILLED';

      // Determinar quantidade executada e preço médio
      // IMPORTANTE: Para ordens LIMIT que já foram preenchidas, verificar filled primeiro
      let executedQty = 0;
      if (order.filled && order.filled > 0) {
        executedQty = order.filled;
      } else if (isOrderFilled) {
        // Se status é FILLED mas filled não está disponível, usar amount
        executedQty = order.amount || baseQty || 0;
      }
      
      const avgPrice = order.average || order.price || tradeJob.limit_price?.toNumber() || 0;
      const cummQuoteQty = order.cost || (executedQty * avgPrice);
      
      // Log para debug
      this.logger.log(`[EXECUTOR] Ordem LIMIT status: ${orderStatus}, filled: ${order.filled}, amount: ${order.amount}, executedQty calculado: ${executedQty}, isOrderFilled: ${isOrderFilled}`);

      // VALIDAÇÃO DE SEGURANÇA: Verificar lucro mínimo antes de executar venda (apenas se ordem foi preenchida)
      if (tradeJob.side === 'SELL' && executedQty > 0) {
        try {
          const { PositionService } = await import('@mvcashnode/domain');
          const positionService = new PositionService(this.prisma);
          
          const openPosition = await this.prisma.tradePosition.findFirst({
            where: {
              exchange_account_id: tradeJob.exchange_account_id,
              symbol: tradeJob.symbol,
              trade_mode: tradeJob.trade_mode,
              status: 'OPEN',
              qty_remaining: { gt: 0 },
            },
            orderBy: {
              created_at: 'asc',
            },
          });

          if (openPosition) {
            // Ignorar validação de lucro mínimo para posições resíduo (is_dust = true)
            if (!openPosition.is_dust) {
              const validationResult = await positionService.validateMinProfit(openPosition.id, avgPrice);

              if (!validationResult.valid) {
                this.logger.warn(`[EXECUTOR] ⚠️ Validação de lucro mínimo FALHOU: ${validationResult.reason}`);
                await this.prisma.tradeJob.update({
                  where: { id: tradeJobId },
                  data: {
                    status: TradeJobStatus.FAILED,
                    reason_code: 'MIN_PROFIT_NOT_MET',
                    reason_message: validationResult.reason,
                  },
                });
                throw new Error(`Venda não permitida: ${validationResult.reason}`);
              } else {
                this.logger.log(`[EXECUTOR] ✅ Validação de lucro mínimo PASSOU: ${validationResult.reason}`);
              }
            } else {
              this.logger.log(`[EXECUTOR] ✅ Validação de lucro mínimo IGNORADA (posição resíduo)`);
            }
          }
        } catch (validationError: any) {
          if (validationError.message.includes('MIN_PROFIT_NOT_MET') || validationError.message.includes('Venda não permitida')) {
            throw validationError;
          }
          // Se for outro erro, apenas logar e continuar (não bloquear execução)
          this.logger.warn(`[EXECUTOR] Erro ao validar lucro mínimo (continuando): ${validationError.message}`);
        }
      }

      // ✅ REMOVIDO: Early return para ordens LIMIT não preenchidas
      // Agora o código continua normalmente. Se executedQty === 0, não será chamado onBuyExecuted/onSellExecuted
      // mas a execution será criada com exchange_order_id para o limit-orders-monitor processar depois

      // Verificar se ordem foi parcialmente preenchida
      const isPartiallyFilled = isOrderPartiallyFilled || (order.filled && order.filled < order.amount);

      // Extrair taxas - PRIORIDADE: usar fetchMyTrades (fonte confiável)
      let feeAmount: number | null = null;
      let feeCurrency: string | null = null;
      let feeRate: number | null = null;
      
      try {
        // 1. Tentar buscar trades reais da exchange (fonte mais confiável)
        if (order.id) {
          try {
            const since = Date.now() - 60000; // Último minuto
            const trades = await adapter.fetchMyTrades(tradeJob.symbol, since, 100);
            
            // Filtrar trades que correspondem à ordem
            const orderTrades = trades.filter((t: any) => {
              // Verificar por orderId, order, ou clientOrderId
              return t.order === order.id || 
                     t.orderId === order.id || 
                     (t.info && (t.info.orderId === order.id || t.info.orderListId === order.id));
            });
            
            if (orderTrades.length > 0) {
              const fees = adapter.extractFeesFromTrades(orderTrades);
              if (fees.feeAmount > 0) {
                feeAmount = fees.feeAmount;
                feeCurrency = fees.feeCurrency;
                this.logger.log(`[EXECUTOR] Taxas extraídas de trades: ${feeAmount} ${feeCurrency} (${orderTrades.length} trade(s))`);
              }
            }
          } catch (tradesError: any) {
            // Se fetchMyTrades falhar, continuar com fallback
            this.logger.debug(`[EXECUTOR] Não foi possível buscar trades: ${tradesError.message}`);
          }
        }
        
        // 2. Se não encontrou em trades, usar extractFeesFromOrder (fallback)
        if (!feeAmount || feeAmount === 0) {
          const fees = adapter.extractFeesFromOrder(order, tradeJob.side.toLowerCase() as 'buy' | 'sell');
          feeAmount = fees.feeAmount;
          feeCurrency = fees.feeCurrency;
          if (feeAmount > 0) {
            this.logger.log(`[EXECUTOR] Taxas extraídas da ordem: ${feeAmount} ${feeCurrency}`);
          }
        }
        
        // 3. Calcular taxa percentual se possível
        if (feeAmount > 0 && cummQuoteQty > 0) {
          feeRate = (feeAmount / cummQuoteQty) * 100;
        }
        
        if (feeAmount > 0) {
          this.logger.log(`[EXECUTOR] Taxas finais: ${feeAmount} ${feeCurrency}, taxa: ${feeRate?.toFixed(4)}%`);
        } else {
          // ✅ TAXAS FIX: Se não encontrou taxa, tentar buscar ordem novamente após 2 segundos
          this.logger.warn(`[EXECUTOR] Nenhuma taxa encontrada na ordem ou trades. Tentando buscar ordem novamente...`);
          
          try {
            // Aguardar 2 segundos para a exchange processar
            await new Promise((resolve) => setTimeout(resolve, 2000));
            
            // Buscar ordem novamente
            // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
            const refreshedOrder = await this.executeWithRetry(
              () => adapter.fetchOrder(order.id, tradeJob.symbol),
              `fetchOrder(${order.id})`,
              3
            );
            this.logger.log(`[EXECUTOR] Ordem buscada novamente, tentando extrair taxas...`);
            
            // Tentar extrair taxas novamente
            const refreshedFees = adapter.extractFeesFromOrder(refreshedOrder, tradeJob.side.toLowerCase() as 'buy' | 'sell');
            if (refreshedFees.feeAmount > 0 && refreshedFees.feeCurrency) {
              feeAmount = refreshedFees.feeAmount;
              feeCurrency = refreshedFees.feeCurrency;
              if (cummQuoteQty > 0) {
                feeRate = (feeAmount / cummQuoteQty) * 100;
              }
              this.logger.log(`[EXECUTOR] ✅ Taxas encontradas após retry: ${feeAmount} ${feeCurrency}, taxa: ${feeRate?.toFixed(4)}%`);
            } else {
              this.logger.error(`[EXECUTOR] ❌ CRÍTICO: Ainda não foi possível obter taxas da exchange após retry. Continuando com taxa zero.`);
              // Continuar com taxa zero para não bloquear a execução
              feeAmount = 0;
              feeCurrency = '';
            }
          } catch (retryError: any) {
            this.logger.error(`[EXECUTOR] ❌ Erro ao tentar buscar ordem novamente: ${retryError.message}`);
            // Continuar com taxa zero
            feeAmount = 0;
            feeCurrency = '';
          }
        }
      } catch (feeError: any) {
        this.logger.warn(`[EXECUTOR] Erro ao extrair taxas: ${feeError.message}`);
        feeAmount = 0;
        feeCurrency = '';
      }

      // ✅ BUG 3 FIX: NÃO ajustar quantidade executada para taxas em base asset
      // A exchange mantém a quantidade BRUTA (incluindo taxa), então devemos salvar a quantidade bruta
      // na execution e posição para que bata com o saldo na exchange
      // As taxas são mantidas separadas nos campos fee_amount e fee_currency
      let adjustedExecutedQty = executedQty; // Usar quantidade bruta (sem ajuste)

      // Ajustar cumm_quote_qty se taxa for em quote asset (SELL) - isso está correto
      let adjustedCummQuoteQty = cummQuoteQty;
      if (tradeJob.side === 'SELL' && feeAmount && feeCurrency) {
        const quoteAsset = tradeJob.symbol.split('/')[1] || 'USDT';
        if (feeCurrency === quoteAsset) {
          adjustedCummQuoteQty = Math.max(0, cummQuoteQty - feeAmount);
          this.logger.log(`[EXECUTOR] Valor ajustado por taxa (quote asset): ${cummQuoteQty} -> ${adjustedCummQuoteQty}`);
        }
      }

      // Create execution
      const execution = await this.prisma.tradeExecution.create({
        data: {
          trade_job_id: tradeJobId,
          exchange_account_id: tradeJob.exchange_account_id,
          trade_mode: tradeJob.trade_mode,
          exchange: tradeJob.exchange_account.exchange,
          exchange_order_id: order.id,
          client_order_id: `client-${tradeJobId}-${Date.now()}`,
          status_exchange: order.status,
          executed_qty: adjustedExecutedQty,
          cumm_quote_qty: adjustedCummQuoteQty,
          avg_price: avgPrice,
          fee_amount: feeAmount || undefined,
          fee_currency: feeCurrency || undefined,
          fee_rate: feeRate || undefined,
          fills_json: order.fills || undefined,
          raw_response_json: JSON.parse(JSON.stringify(order)),
        },
      });

      this.logger.log(`[EXECUTOR] Execution criado: ${execution.id}, qty: ${executedQty}, price: ${avgPrice}`);

      // Sempre verificar na exchange se a ordem foi preenchida, especialmente para MARKET orders
      // Isso garante que temos os dados corretos mesmo se a resposta inicial não tiver todos os dados
      // IMPORTANTE: Usar adjustedExecutedQty como base (já ajustado pela taxa se necessário)
      let finalExecutedQty = adjustedExecutedQty;
      let finalAvgPrice = avgPrice;
      let finalCummQuoteQty = adjustedCummQuoteQty;
      
      // Verificar na exchange se:
      // 1. A ordem está FILLED mas temos quantidade 0 (dados faltando)
      // 2. É uma ordem MARKET FILLED (sempre verificar para garantir dados corretos)
      const shouldVerifyOnExchange = (executedQty === 0 && (isOrderFilled || orderStatus === 'FILLED' || orderStatus === 'CLOSED')) ||
                                     (tradeJob.order_type === 'MARKET' && isOrderFilled && order.id);
      
      if (shouldVerifyOnExchange) {
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Verificando dados da ordem ${order.id} na exchange...`);
        
        try {
          // Buscar dados atualizados da exchange
          // ✅ BUG-ALTO-003 FIX: Usar retry para erros de rede
          const updatedOrder = await this.executeWithRetry(
            () => adapter.fetchOrder(order.id, tradeJob.symbol),
            `fetchOrder(${order.id})`,
            3
          );
          this.logger.log(`[EXECUTOR] Dados atualizados da exchange para ordem ${order.id}:`, {
            status: updatedOrder.status,
            filled: updatedOrder.filled,
            amount: updatedOrder.amount,
            cost: updatedOrder.cost,
            average: updatedOrder.average,
            price: updatedOrder.price,
            fills: updatedOrder.fills?.length || 0,
          });
          
          // Extrair dados corretos da ordem atualizada
          // Para Bybit, pode ser que os dados estejam em campos diferentes ou nos fills
          let updatedFilled = updatedOrder.filled || 0;
          let updatedAverage = updatedOrder.average || updatedOrder.price || 0;
          let updatedCost = updatedOrder.cost || 0;
          
          // Se não encontrou dados diretos, tentar extrair dos fills
          if ((updatedFilled === 0 || updatedAverage === 0) && updatedOrder.fills && updatedOrder.fills.length > 0) {
            this.logger.log(`[EXECUTOR] Extraindo dados dos fills da ordem ${order.id}...`);
            let totalFilled = 0;
            let totalCost = 0;
            
            for (const fill of updatedOrder.fills) {
              const fillQty = fill.amount || fill.quantity || 0;
              const fillPrice = fill.price || 0;
              totalFilled += fillQty;
              totalCost += fillQty * fillPrice;
            }
            
            if (totalFilled > 0) {
              updatedFilled = totalFilled;
              updatedAverage = totalCost / totalFilled;
              updatedCost = totalCost;
              this.logger.log(`[EXECUTOR] Dados extraídos dos fills: qty=${updatedFilled}, avgPrice=${updatedAverage}, cost=${updatedCost}`);
            }
          }
          
          // Se encontrou dados válidos, atualizar
          if (updatedFilled > 0 && updatedAverage > 0) {
            finalExecutedQty = updatedFilled;
            finalAvgPrice = updatedAverage;
            finalCummQuoteQty = updatedCost > 0 ? updatedCost : (updatedFilled * updatedAverage);
            
            // Extrair taxas da ordem atualizada - PRIORIDADE: usar fetchMyTrades
            let updatedFeeAmount: number | null = null;
            let updatedFeeCurrency: string | null = null;
            let updatedFeeRate: number | null = null;
            
            try {
              // 1. Tentar buscar trades reais da exchange (fonte mais confiável)
              if (updatedOrder.id) {
                try {
                  const since = Date.now() - 60000; // Último minuto
                  const trades = await adapter.fetchMyTrades(tradeJob.symbol, since, 100);
                  
                  // Filtrar trades que correspondem à ordem
                  const orderTrades = trades.filter((t: any) => {
                    return t.order === updatedOrder.id || 
                           t.orderId === updatedOrder.id || 
                           (t.info && (t.info.orderId === updatedOrder.id || t.info.orderListId === updatedOrder.id));
                  });
                  
                  if (orderTrades.length > 0) {
                    const fees = adapter.extractFeesFromTrades(orderTrades);
                    if (fees.feeAmount > 0) {
                      updatedFeeAmount = fees.feeAmount;
                      updatedFeeCurrency = fees.feeCurrency;
                      this.logger.log(`[EXECUTOR] Taxas extraídas de trades (atualizado): ${updatedFeeAmount} ${updatedFeeCurrency}`);
                    }
                  }
                } catch (tradesError: any) {
                  this.logger.debug(`[EXECUTOR] Não foi possível buscar trades atualizados: ${tradesError.message}`);
                }
              }
              
              // 2. Se não encontrou em trades, usar extractFeesFromOrder (fallback)
              if (!updatedFeeAmount || updatedFeeAmount === 0) {
                const fees = adapter.extractFeesFromOrder(updatedOrder, tradeJob.side.toLowerCase() as 'buy' | 'sell');
                updatedFeeAmount = fees.feeAmount;
                updatedFeeCurrency = fees.feeCurrency;
              }
              
              if (updatedFeeAmount > 0 && finalCummQuoteQty > 0) {
                updatedFeeRate = (updatedFeeAmount / finalCummQuoteQty) * 100;
              }
            } catch (feeError: any) {
              this.logger.warn(`[EXECUTOR] Erro ao extrair taxas da ordem atualizada: ${feeError.message}`);
            }

            // Ajustar quantidade se taxa for em base asset (BUY)
            // IMPORTANTE: Se a taxa veio dos trades, finalExecutedQty pode estar bruto (não ajustado)
            if (tradeJob.side === 'BUY' && updatedFeeAmount && updatedFeeCurrency) {
              const baseAsset = getBaseAsset(tradeJob.symbol);
              if (updatedFeeCurrency === baseAsset) {
                // Verificar se a quantidade já foi ajustada
                // Se finalExecutedQty + updatedFeeAmount ≈ quantidade bruta esperada, então não foi ajustado
                const expectedGrossQty = finalExecutedQty + updatedFeeAmount;
                const expectedCost = expectedGrossQty * finalAvgPrice;
                const costDifference = Math.abs(expectedCost - finalCummQuoteQty);
                
                // Se o custo esperado é muito próximo do cumm_quote_qty, quantidade não foi ajustada
                if (costDifference < finalCummQuoteQty * 0.02) {
                  // Quantidade está bruta, ajustar
                  finalExecutedQty = Math.max(0, finalExecutedQty - updatedFeeAmount);
                  this.logger.log(`[EXECUTOR] Quantidade ajustada por taxa (base asset): ${finalExecutedQty + updatedFeeAmount} -> ${finalExecutedQty}`);
                } else {
                  // Quantidade já está ajustada, não fazer nada
                  this.logger.log(`[EXECUTOR] Quantidade já está ajustada: ${finalExecutedQty}`);
                }
              }
            }

            // Ajustar cumm_quote_qty se taxa for em quote asset (SELL)
            if (tradeJob.side === 'SELL' && updatedFeeAmount && updatedFeeCurrency) {
              const quoteAsset = getQuoteAsset(tradeJob.symbol);
              if (updatedFeeCurrency === quoteAsset) {
                finalCummQuoteQty = Math.max(0, finalCummQuoteQty - updatedFeeAmount);
              }
            }
            
            this.logger.log(`[EXECUTOR] ✅ Dados corrigidos da exchange: qty=${finalExecutedQty}, price=${finalAvgPrice}, cost=${finalCummQuoteQty}, fee=${updatedFeeAmount} ${updatedFeeCurrency}`);
            
            // Atualizar a execução com os dados corretos
            await this.prisma.tradeExecution.update({
              where: { id: execution.id },
              data: {
                executed_qty: finalExecutedQty,
                avg_price: finalAvgPrice,
                cumm_quote_qty: finalCummQuoteQty,
                fee_amount: updatedFeeAmount || undefined,
                fee_currency: updatedFeeCurrency || undefined,
                fee_rate: updatedFeeRate || undefined,
                status_exchange: updatedOrder.status || order.status,
                raw_response_json: JSON.parse(JSON.stringify(updatedOrder)),
              },
            });
            
            this.logger.log(`[EXECUTOR] ✅ Execution ${execution.id} atualizado com dados corretos da exchange`);
          } else {
            this.logger.warn(`[EXECUTOR] ⚠️ Ordem ${order.id} na exchange também tem quantidade 0 ou preço 0. Status: ${updatedOrder.status}`);
          }
        } catch (fetchError: any) {
          this.logger.error(`[EXECUTOR] ❌ Erro ao buscar dados atualizados da exchange para ordem ${order.id}: ${fetchError.message}`);
          // Continuar com os dados originais se não conseguir buscar
        }
      }

      // ✅ NOVO: Se ordem LIMIT não foi preenchida (executedQty === 0), manter PENDING_LIMIT
      if (isLimitOrder && finalExecutedQty === 0 && isOrderNew) {
        this.logger.log(`[EXECUTOR] Ordem LIMIT ${order.id} não foi preenchida, mantendo status PENDING_LIMIT. Execution criada: ${execution.id}`);
        
        // Atualizar status para PENDING_LIMIT
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: {
            status: TradeJobStatus.PENDING_LIMIT,
            reason_code: 'LIMIT_ORDER_PLACED',
            reason_message: `Ordem LIMIT criada na exchange (${order.id}), aguardando preenchimento`,
          },
        });
        
        // Retornar sem processar posições (não há quantidade executada)
        return {
          success: true,
          executionId: execution.id,
          executedQty: 0,
          avgPrice: tradeJob.limit_price?.toNumber() || 0,
          isPartiallyFilled: false,
          limitOrderPlaced: true,
          exchangeOrderId: order.id,
        };
      }

      // Update position apenas se quantidade executada > 0
      if (finalExecutedQty > 0) {
        // Buscar execução atualizada para obter taxas
        const updatedExecution = await this.prisma.tradeExecution.findUnique({
          where: { id: execution.id },
        });

        const positionService = new PositionService(this.prisma);
        try {
          if (tradeJob.side === 'BUY') {
            const positionId = await positionService.onBuyExecuted(
              tradeJobId,
              execution.id,
              finalExecutedQty,
              finalAvgPrice,
              updatedExecution?.fee_amount?.toNumber(),
              updatedExecution?.fee_currency || undefined
            );
            this.logger.log(`[EXECUTOR] Posição de compra atualizada para job ${tradeJobId}, positionId: ${positionId}`);
            
            // Enviar notificação de posição aberta
            try {
              await this.notificationService.sendPositionOpened(positionId);
              this.logger.log(`[EXECUTOR] Notificação de posição aberta enviada para positionId: ${positionId}`);
            } catch (notifError: any) {
              this.logger.warn(`[EXECUTOR] Erro ao enviar notificação de posição aberta: ${notifError.message}`);
            }
          } else {
            // Determinar origin baseado na posição vinculada ou posições elegíveis
            let sellOrigin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING' = 'WEBHOOK';
            
            // Buscar posições antes de executar para comparação posterior
            let positionsBefore: Awaited<ReturnType<typeof this.prisma.tradePosition.findMany>> = [];
            
            // Se há position_id_to_close, buscar essa posição específica para determinar origin
            if (tradeJob.position_id_to_close) {
              const targetPosition = await this.prisma.tradePosition.findUnique({
                where: { id: tradeJob.position_id_to_close },
              });
              
              if (targetPosition) {
                // Armazenar a posição específica para comparação posterior
                positionsBefore = [targetPosition];
                
                this.logger.log(`[EXECUTOR] Job ${tradeJobId} tem position_id_to_close=${tradeJob.position_id_to_close}, verificando flags dessa posição`);
                
                if (targetPosition.tp_triggered) {
                  sellOrigin = 'TAKE_PROFIT';
                  this.logger.log(`[EXECUTOR] Origin determinado como TAKE_PROFIT (posição ${targetPosition.id} vinculada tem tp_triggered=true)`);
                } else if (targetPosition.sl_triggered) {
                  sellOrigin = 'STOP_LOSS';
                  this.logger.log(`[EXECUTOR] Origin determinado como STOP_LOSS (posição ${targetPosition.id} vinculada tem sl_triggered=true)`);
                } else if (targetPosition.trailing_triggered) {
                  sellOrigin = 'TRAILING';
                  this.logger.log(`[EXECUTOR] Origin determinado como TRAILING (posição ${targetPosition.id} vinculada tem trailing_triggered=true)`);
                } else {
                  // Se não tem flags, verificar webhook_event_id
                  if (tradeJob.webhook_event_id) {
                    sellOrigin = 'WEBHOOK';
                    this.logger.log(`[EXECUTOR] Origin determinado como WEBHOOK (posição ${targetPosition.id} vinculada, trade job tem webhook_event_id)`);
                  } else {
                    sellOrigin = 'MANUAL';
                    this.logger.log(`[EXECUTOR] Origin determinado como MANUAL (posição ${targetPosition.id} vinculada, sem webhook_event_id)`);
                  }
                }
              } else {
                this.logger.warn(`[EXECUTOR] Job ${tradeJobId} tem position_id_to_close=${tradeJob.position_id_to_close} mas posição não encontrada, usando lógica padrão`);
                // Fallback para lógica padrão
                sellOrigin = tradeJob.webhook_event_id ? 'WEBHOOK' : 'MANUAL';
              }
            } else {
              // Buscar posições que serão fechadas antes de executar (lógica FIFO)
              positionsBefore = await this.prisma.tradePosition.findMany({
                where: {
                  exchange_account_id: tradeJob.exchange_account_id,
                  trade_mode: tradeJob.trade_mode,
                  symbol: tradeJob.symbol,
                  status: 'OPEN',
                  qty_remaining: { gt: 0 },
                },
              });

              if (positionsBefore.length > 0) {
                // Verificar flags na primeira posição (FIFO)
                const firstPosition = positionsBefore[0];
                
                if (firstPosition.tp_triggered) {
                  sellOrigin = 'TAKE_PROFIT';
                  this.logger.log(`[EXECUTOR] Origin determinado como TAKE_PROFIT (posição ${firstPosition.id} tem tp_triggered=true)`);
                } else if (firstPosition.sl_triggered) {
                  sellOrigin = 'STOP_LOSS';
                  this.logger.log(`[EXECUTOR] Origin determinado como STOP_LOSS (posição ${firstPosition.id} tem sl_triggered=true)`);
                } else if (firstPosition.trailing_triggered) {
                  sellOrigin = 'TRAILING';
                  this.logger.log(`[EXECUTOR] Origin determinado como TRAILING (posição ${firstPosition.id} tem trailing_triggered=true)`);
                } else {
                  // Verificar se não há webhook_event_id no trade job (indica origem manual ou SL/TP)
                  if (!tradeJob.webhook_event_id) {
                    // Se não tem webhook_event_id, pode ser manual ou SL/TP
                    // Verificar reason_code ou reason_message para mais contexto
                    if (tradeJob.reason_code?.includes('TAKE_PROFIT') || tradeJob.reason_message?.includes('Take Profit')) {
                      sellOrigin = 'TAKE_PROFIT';
                    } else if (tradeJob.reason_code?.includes('STOP_LOSS') || tradeJob.reason_message?.includes('Stop Loss')) {
                      sellOrigin = 'STOP_LOSS';
                    } else {
                      sellOrigin = 'MANUAL';
                    }
                    this.logger.log(`[EXECUTOR] Origin determinado como ${sellOrigin} (sem webhook_event_id, reason_code: ${tradeJob.reason_code})`);
                  } else {
                    sellOrigin = 'WEBHOOK';
                    this.logger.log(`[EXECUTOR] Origin determinado como WEBHOOK (trade job tem webhook_event_id)`);
                  }
                }
              }
            }

            this.logger.log(`[EXECUTOR] Chamando onSellExecuted para job ${tradeJobId}: qty=${finalExecutedQty}, price=${finalAvgPrice}, origin=${sellOrigin}, position_id_to_close=${tradeJob.position_id_to_close || 'N/A'}`);
            
            await positionService.onSellExecuted(
              tradeJobId,
              execution.id,
              finalExecutedQty,
              finalAvgPrice,
              sellOrigin,
              updatedExecution?.fee_amount?.toNumber(),
              updatedExecution?.fee_currency || undefined
            );
            this.logger.log(`[EXECUTOR] Posição de venda atualizada para job ${tradeJobId} (origin: ${sellOrigin})`);

            // Verificar quais posições foram fechadas ou parcialmente fechadas
            const positionsAfter = await this.prisma.tradePosition.findMany({
              where: {
                id: { in: positionsBefore.map(p => p.id) },
              },
            });

            // Enviar notificação para posições que foram fechadas ou parcialmente fechadas
            for (const posBefore of positionsBefore) {
              const posAfter = positionsAfter.find(p => p.id === posBefore.id);
              if (!posAfter) continue;

              const wasClosed = posAfter.status === 'CLOSED' && posBefore.status === 'OPEN';
              const wasPartiallyClosed = posAfter.qty_remaining.toNumber() < posBefore.qty_remaining.toNumber();

              if (wasClosed) {
                // Posição totalmente fechada - verificar motivo
                try {
                  // Verificar se foi SL (sl_triggered foi marcado antes ou close_reason indica SL)
                  if (posBefore.sl_triggered || posAfter.close_reason === 'STOP_LOSS') {
                    await this.notificationService.sendStopLoss(posAfter.id, execution.id);
                    this.logger.log(`[EXECUTOR] Notificação de Stop Loss enviada para positionId: ${posAfter.id}`);
                  } else {
                    // Outros motivos (TP, webhook, manual)
                    await this.notificationService.sendPositionClosed(posAfter.id);
                    this.logger.log(`[EXECUTOR] Notificação de posição fechada enviada para positionId: ${posAfter.id}`);
                  }
                } catch (notifError: any) {
                  this.logger.warn(`[EXECUTOR] Erro ao enviar notificação: ${notifError.message}`);
                }
              } else if (wasPartiallyClosed && posAfter.tp_enabled) {
                // Venda parcial com TP configurado - pode ser TP parcial
                // Marcar como partial_tp_triggered se ainda não estiver marcado
                if (!posAfter.partial_tp_triggered) {
                  await this.prisma.tradePosition.update({
                    where: { id: posAfter.id },
                    data: { partial_tp_triggered: true },
                  });
                }
                try {
                  await this.notificationService.sendPartialTP(posAfter.id, execution.id);
                  this.logger.log(`[EXECUTOR] Notificação de TP parcial enviada para positionId: ${posAfter.id}`);
                } catch (notifError: any) {
                  this.logger.warn(`[EXECUTOR] Erro ao enviar notificação de TP parcial: ${notifError.message}`);
                }
              }
            }
          }
        } catch (positionError: any) {
          this.logger.error(`[EXECUTOR] Erro ao atualizar posição: ${positionError.message}`, positionError.stack);
          // Não falhar o job se apenas a atualização de posição falhar
        }
      }

      // Update vault if applicable
      if (tradeJob.vault_id && executedQty > 0) {
        const vaultService = new VaultService(this.prisma);
        try {
          if (tradeJob.side === 'BUY') {
            await vaultService.confirmBuy(
              tradeJob.vault_id,
              'USDT',
              cummQuoteQty,
              tradeJobId
            );
            this.logger.log(`[EXECUTOR] Cofre atualizado (confirmBuy) para job ${tradeJobId}`);
          } else {
            await vaultService.creditOnSell(
              tradeJob.vault_id,
              'USDT',
              cummQuoteQty,
              tradeJobId
            );
            this.logger.log(`[EXECUTOR] Cofre atualizado (creditOnSell) para job ${tradeJobId}`);
          }
        } catch (vaultError: any) {
          this.logger.error(`[EXECUTOR] Erro ao atualizar cofre: ${vaultError.message}`, vaultError.stack);
          // Não falhar o job se apenas a atualização de cofre falhar
        }
      }

      // Update job status - verificar status atual antes de atualizar
      // onSellExecuted pode ter marcado como SKIPPED ou PARTIALLY_FILLED
      const currentJob = await this.prisma.tradeJob.findUnique({
        where: { id: tradeJobId },
        select: { status: true },
      });

      let finalStatus: string;

      // Se o job já foi marcado como SKIPPED por onSellExecuted (quando não há posições elegíveis), não sobrescrever
      if (currentJob?.status === TradeJobStatus.SKIPPED) {
        finalStatus = TradeJobStatus.SKIPPED;
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} já está como SKIPPED (marcado por onSellExecuted), não atualizando status`);
      }
      // Se o job já foi marcado como PARTIALLY_FILLED por onSellExecuted, manter esse status
      else if (currentJob?.status === TradeJobStatus.PARTIALLY_FILLED) {
        finalStatus = TradeJobStatus.PARTIALLY_FILLED;
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} já está como PARTIALLY_FILLED (marcado por onSellExecuted), mantendo status`);
      }
      // Se o status ainda é EXECUTING ou outro status intermediário, atualizar para FILLED/PARTIALLY_FILLED
      else {
        finalStatus = isPartiallyFilled ? TradeJobStatus.PARTIALLY_FILLED : TradeJobStatus.FILLED;
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: {
            status: finalStatus,
            reason_code: isPartiallyFilled ? 'PARTIALLY_FILLED' : null,
            reason_message: isPartiallyFilled ? 'Ordem parcialmente preenchida' : null,
          },
        });
        this.logger.log(`[EXECUTOR] Job ${tradeJobId} atualizado para status: ${finalStatus}`);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`[EXECUTOR] Trade job ${tradeJobId} concluído com sucesso em ${duration}ms. Status: ${finalStatus}`);

      return {
        success: true,
        executionId: execution.id,
        executedQty,
        avgPrice,
        isPartiallyFilled,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';
      
      this.logger.error(`[EXECUTOR] Job ${tradeJobId} - ERRO ao processar (${duration}ms): ${errorMessage}`);
      if (error?.stack) {
        this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Stack trace: ${error.stack}`);
      }

      // Determinar reason_code baseado no erro
      let reasonCode = 'EXECUTION_ERROR';
      let reasonMessage = errorMessage;

      // Erros de quantidade (já tratados acima, mas pode chegar aqui se houver exceção não tratada)
      if (errorMessage.includes('Quantidade inválida')) {
        if (errorMessage.includes('MISSING_TRADE_PARAMETER')) {
          reasonCode = 'MISSING_TRADE_PARAMETER';
        } else if (errorMessage.includes('BALANCE_NOT_FOUND')) {
          reasonCode = 'BALANCE_NOT_FOUND';
        } else if (errorMessage.includes('INVALID_TRADE_PARAMETER')) {
          reasonCode = 'INVALID_TRADE_PARAMETER';
        } else if (errorMessage.includes('INVALID_QUANTITY_CALCULATED')) {
          reasonCode = 'INVALID_QUANTITY_CALCULATED';
        } else {
          reasonCode = 'INVALID_QUANTITY';
        }
      } else if (errorMessage.includes('INSUFFICIENT_BALANCE') || errorMessage.includes('Saldo insuficiente')) {
        reasonCode = 'INSUFFICIENT_BALANCE';
        reasonMessage = 'Saldo insuficiente na exchange';
        // Marcar como SKIPPED ao invés de FAILED
        try {
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.SKIPPED,
              reason_code: reasonCode,
              reason_message: reasonMessage,
            },
          });
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Status atualizado para SKIPPED (saldo insuficiente)`);
          return; // Retornar sem lançar erro
        } catch (updateError: any) {
          this.logger.error(`[EXECUTOR] Job ${tradeJobId} - Erro ao atualizar status: ${updateError?.message}`);
        }
      } else if (errorMessage.includes('RATE_LIMIT_EXCEEDED') || errorMessage.includes('rate limit')) {
        reasonCode = 'RATE_LIMIT_EXCEEDED';
        reasonMessage = 'Rate limit da exchange excedido';
      } else if (errorMessage.includes('INVALID_SYMBOL') || errorMessage.includes('Símbolo inválido')) {
        reasonCode = 'INVALID_SYMBOL';
        reasonMessage = 'Símbolo inválido ou não suportado';
      } else if (errorMessage.includes('MIN_NOTIONAL_NOT_MET') || errorMessage.includes('quantidade mínima')) {
        reasonCode = 'MIN_NOTIONAL_NOT_MET';
        reasonMessage = 'Quantidade abaixo do mínimo permitido pela exchange';
      } else if (errorMessage.includes('NETWORK_ERROR') || errorMessage.includes('timeout') || errorMessage.includes('network')) {
        reasonCode = 'NETWORK_ERROR';
        reasonMessage = 'Erro de rede ou timeout na comunicação com a exchange';
      } else if (errorMessage.includes('API keys') || errorMessage.includes('Credenciais')) {
        reasonCode = 'INVALID_API_KEYS';
        reasonMessage = 'Credenciais de API inválidas ou expiradas';
      } else if (errorMessage.includes('não encontrado') || errorMessage.includes('not found')) {
        reasonCode = 'RESOURCE_NOT_FOUND';
        reasonMessage = errorMessage;
      }

      // Lista de erros não recuperáveis (não adianta tentar de novo)
      const nonRecoverableErrors = [
        'INVALID_PRECISION',
        'INVALID_QUANTITY',
        'INVALID_SYMBOL',
        'INVALID_PRICE',
        'INSUFFICIENT_BALANCE',
      ];

      // Update job status to FAILED ou SKIPPED (apenas se ainda não foi atualizado)
      // Para INSUFFICIENT_BALANCE, usar SKIPPED; para outros erros, usar FAILED
      try {
        const currentJob = await this.prisma.tradeJob.findUnique({
          where: { id: tradeJobId },
          select: { status: true },
        });

        // Se já foi marcado como SKIPPED (saldo insuficiente), não fazer nada
        if (currentJob?.status === TradeJobStatus.SKIPPED) {
          this.logger.debug(`[EXECUTOR] Job ${tradeJobId} - Status já é SKIPPED, não atualizando`);
          return; // Retornar sem lançar erro
        }

        // Só atualizar se ainda não foi marcado como FAILED ou SKIPPED
        if (currentJob && currentJob.status !== TradeJobStatus.FAILED && currentJob.status !== TradeJobStatus.SKIPPED) {
          const finalStatus = reasonCode === 'INSUFFICIENT_BALANCE' ? TradeJobStatus.SKIPPED : TradeJobStatus.FAILED;
          const statusLabel = reasonCode === 'INSUFFICIENT_BALANCE' ? 'SKIPPED' : 'FAILED';
          
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: finalStatus,
              reason_code: reasonCode,
              reason_message: reasonMessage,
            },
          });
          this.logger.log(`[EXECUTOR] Job ${tradeJobId} - Status atualizado para ${statusLabel} com reason_code: ${reasonCode}`);
        } else {
          this.logger.debug(`[EXECUTOR] Job ${tradeJobId} - Status já atualizado (${currentJob?.status}), não atualizando novamente`);
        }
      } catch (updateError: any) {
        this.logger.error(`[EXECUTOR] Job ${tradeJobId} - ERRO ao atualizar status do job: ${updateError?.message}`);
      }

      // Se for erro não recuperável, retornar sem lançar (evita retry do BullMQ)
      if (nonRecoverableErrors.includes(reasonCode)) {
        this.logger.warn(`[EXECUTOR] Job ${tradeJobId} - Erro não recuperável (${reasonCode}), não será retentado`);
        return; // Retornar sem lançar erro
      }

      // Para erros recuperáveis, lançar para permitir retry do BullMQ
      throw error;
    }
  }
}

