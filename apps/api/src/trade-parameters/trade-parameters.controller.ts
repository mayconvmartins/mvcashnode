import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TradeParametersService } from './trade-parameters.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Trade Parameters')
@Controller('trade-parameters')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TradeParametersController {
  constructor(
    private tradeParametersService: TradeParametersService,
    private prisma: PrismaService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar parâmetros de trading (paginado)',
    description: 'Retorna todos os parâmetros de trading configurados para o usuário autenticado.',
  })
  @ApiQuery({ name: 'exchange_account_id', required: false, type: Number, description: 'Filtrar por conta de exchange' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: 'Filtrar por símbolo' })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number, 
    description: 'Número da página (padrão: 1, mínimo: 1)',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Itens por página (padrão: 100, mínimo: 1, máximo: 200)',
    example: 100
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de parâmetros de trading (paginada)',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              user_id: { type: 'number', example: 1 },
              exchange_account_id: { type: 'number', example: 1 },
              symbol: { type: 'string', example: 'BTCUSDT' },
              side: { type: 'string', example: 'BOTH' },
              quote_amount_fixed: { type: 'number', example: 100 },
              order_type_default: { type: 'string', example: 'MARKET' },
              default_sl_enabled: { type: 'boolean', example: true },
              default_sl_pct: { type: 'number', example: 1.0 },
              default_tp_enabled: { type: 'boolean', example: true },
              default_tp_pct: { type: 'number', example: 2.0 },
              exchange_account: {
                type: 'object',
                properties: {
                  id: { type: 'number', example: 1 },
                  label: { type: 'string', example: 'Binance Spot Real' },
                  exchange: { type: 'string', example: 'BINANCE_SPOT' },
                },
              },
              vault: {
                type: 'object',
                properties: {
                  id: { type: 'number', example: 1 },
                  name: { type: 'string', example: 'Cofre Real' },
                },
              },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            current_page: { type: 'number', example: 1 },
            per_page: { type: 'number', example: 100 },
            total_items: { type: 'number', example: 250 },
            total_pages: { type: 'number', example: 3 },
          },
        },
      },
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('exchange_account_id') exchangeAccountIdStr?: string,
    @Query('symbol') symbol?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ): Promise<any> {
    try {
      // ✅ BUG-CRIT-001 FIX: Validar e converter exchangeAccountId de string para number
      let exchangeAccountId: number | undefined;
      if (exchangeAccountIdStr) {
        const accountIdNum = parseInt(exchangeAccountIdStr, 10);
        if (isNaN(accountIdNum) || accountIdNum <= 0) {
          throw new BadRequestException('exchange_account_id deve ser um número válido maior que zero');
        }
        exchangeAccountId = accountIdNum;
      }

      // ✅ BUG-CRIT-003 FIX: Validar limites min/max para paginação
      const finalPage = Math.max(1, page ? Math.min(1000, Math.max(1, parseInt(page, 10) || 1)) : 1);
      const finalLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 100), 200);
      const skip = (finalPage - 1) * finalLimit;

      const where: any = {
        user_id: user.userId,
      };

      if (exchangeAccountId) {
        where.exchange_account_id = exchangeAccountId;
      }

      if (symbol) {
        where.symbol = symbol;
      }

      // Executar count e findMany em paralelo
      const [totalItems, parameters] = await Promise.all([
        this.prisma.tradeParameter.count({ where }),
        this.prisma.tradeParameter.findMany({
          where,
          select: {
            id: true,
            user_id: true,
            exchange_account_id: true,
            symbol: true,
            side: true,
            quote_amount_fixed: true,
            order_type_default: true,
            default_sl_enabled: true,
            default_sl_pct: true,
            default_tp_enabled: true,
            default_tp_pct: true,
            default_sg_enabled: true,
            default_sg_pct: true,
            default_sg_drop_pct: true,
            default_tsg_enabled: true,
            default_tsg_activation_pct: true,
            default_tsg_drop_pct: true,
            created_at: true,
            updated_at: true,
            exchange_account: {
              select: {
                id: true,
                label: true,
                exchange: true,
                is_simulation: true,
              },
            },
            vault: {
              select: {
                id: true,
                name: true,
                trade_mode: true,
              },
            },
          },
          orderBy: {
            created_at: 'desc',
          },
          skip,
          take: finalLimit,
        }),
      ]);

      const totalPages = Math.ceil(totalItems / finalLimit);

      return {
        data: parameters,
        pagination: {
          current_page: finalPage,
          per_page: finalLimit,
          total_items: totalItems,
          total_pages: totalPages,
        },
      };
    } catch (error: any) {
      throw new BadRequestException('Erro ao listar parâmetros de trading');
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter parâmetro de trading por ID',
    description: 'Retorna os detalhes completos de um parâmetro de trading específico.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do parâmetro de trading', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Parâmetro de trading encontrado',
    schema: {
      example: {
        id: 1,
        user_id: 1,
        exchange_account_id: 1,
        symbol: 'SOL/USDT',
        side: 'BUY',
        quote_amount_fixed: 100,
        quote_amount_pct_balance: null,
        max_orders_per_hour: 10,
        min_interval_sec: 60,
        order_type_default: 'MARKET',
        slippage_bps: 0,
        default_sl_enabled: true,
        default_sl_pct: 2.0,
        default_tp_enabled: true,
        default_tp_pct: 5.0,
        trailing_stop_enabled: false,
        trailing_distance_pct: null,
        vault_id: null,
        exchange_account: {
          id: 1,
          label: 'Binance Spot Real',
          exchange: 'BINANCE_SPOT',
          is_simulation: false,
        },
        vault: null,
        created_at: '2025-12-01T10:00:00.000Z',
        updated_at: '2025-12-01T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Parâmetro não encontrado' })
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ): Promise<any> {
    try {
      const parameter = await this.prisma.tradeParameter.findFirst({
        where: {
          id,
          user_id: user.userId,
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
              is_simulation: true,
            },
          },
          vault: {
            select: {
              id: true,
              name: true,
              trade_mode: true,
            },
          },
        },
      });

      if (!parameter) {
        throw new NotFoundException('Parâmetro de trading não encontrado');
      }

      return parameter;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Erro ao obter parâmetro de trading');
    }
  }

  @Post()
  @ApiOperation({
    summary: 'Criar parâmetro de trading',
    description: 'Cria um novo parâmetro de trading para uma conta de exchange e símbolo específicos.',
  })
  @ApiResponse({
    status: 201,
    description: 'Parâmetro criado com sucesso',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async create(@CurrentUser() user: any, @Body() createDto: any) {
    try {
      // Converter accountId para número (caso venha como string)
      // Aceita accountId, exchangeAccountId ou exchange_account_id (formato do frontend)
      const accountId = Number(createDto.accountId || createDto.exchangeAccountId || createDto.exchange_account_id);
      if (isNaN(accountId)) {
        throw new BadRequestException('ID da conta de exchange inválido');
      }

      // Validar que a exchange account pertence ao usuário
      const account = await this.prisma.exchangeAccount.findFirst({
        where: {
          id: accountId,
          user_id: user.userId,
        },
      });

      if (!account) {
        throw new NotFoundException('Conta de exchange não encontrada');
      }

      // Validar vault se fornecido
      if (createDto.vaultId) {
        const vaultId = Number(createDto.vaultId);
        if (isNaN(vaultId)) {
          throw new BadRequestException('ID do cofre inválido');
        }
        
        const vault = await this.prisma.vault.findFirst({
          where: {
            id: vaultId,
            user_id: user.userId,
          },
        });

        if (!vault) {
          throw new NotFoundException('Cofre não encontrado');
        }
      }

      // Validar agrupamento de posições
      const groupPositionsEnabled = createDto.groupPositionsEnabled ?? createDto.group_positions_enabled ?? false;
      const groupPositionsIntervalMinutes = createDto.groupPositionsIntervalMinutes ?? createDto.group_positions_interval_minutes;
      
      if (groupPositionsEnabled && (!groupPositionsIntervalMinutes || groupPositionsIntervalMinutes <= 0)) {
        throw new BadRequestException('Intervalo de agrupamento (group_positions_interval_minutes) é obrigatório e deve ser maior que zero quando agrupamento de posições estiver habilitado');
      }

      // Verificar se é assinante e buscar parâmetros padrão
      const isSubscriber = user.roles && user.roles.includes('subscriber');
      let subscriberParams = null;
      
      if (isSubscriber) {
        subscriberParams = await this.prisma.subscriberParameters.findUnique({
          where: { user_id: user.userId },
        });
      }

      // Mapear campos do frontend para o formato esperado
      // Aplicar parâmetros padrão de assinante se não especificados
      const mappedDto = {
        userId: user.userId,
        exchangeAccountId: accountId,
        symbol: createDto.symbol,
        side: createDto.side,
        quoteAmountFixed: 
          createDto.orderSizeType === 'FIXED' ? createDto.orderSizeValue : undefined,
        quoteAmountPctBalance: 
          createDto.orderSizeType === 'PERCENT_BALANCE' ? createDto.orderSizeValue : undefined,
        maxOrdersPerHour: createDto.maxOrdersPerHour ?? subscriberParams?.max_orders_per_hour,
        minIntervalSec: createDto.minIntervalSec ?? subscriberParams?.min_interval_sec,
        orderTypeDefault: createDto.orderType || subscriberParams?.default_order_type || 'MARKET',
        slippageBps: createDto.slippageBps,
        defaultSlEnabled: createDto.stopLoss !== undefined || createDto.stopLossPercent !== undefined 
          ? (createDto.stopLoss !== undefined || createDto.stopLossPercent !== undefined)
          : (subscriberParams?.default_sl_pct !== null && subscriberParams?.default_sl_pct !== undefined),
        defaultSlPct: createDto.stopLossPercent || createDto.stopLoss || subscriberParams?.default_sl_pct,
        defaultTpEnabled: createDto.takeProfit !== undefined || createDto.takeProfitPercent !== undefined
          ? (createDto.takeProfit !== undefined || createDto.takeProfitPercent !== undefined)
          : (subscriberParams?.default_tp_pct !== null && subscriberParams?.default_tp_pct !== undefined),
        defaultTpPct: createDto.takeProfitPercent || createDto.takeProfit || subscriberParams?.default_tp_pct,
        defaultSgEnabled: createDto.stopGain !== undefined || createDto.stopGainPercent !== undefined
          ? (createDto.stopGain !== undefined || createDto.stopGainPercent !== undefined)
          : (subscriberParams?.default_sg_pct !== null && subscriberParams?.default_sg_pct !== undefined),
        defaultSgPct: createDto.stopGainPercent || createDto.stopGain || subscriberParams?.default_sg_pct,
        defaultSgDropPct: createDto.stopGainDropPercent || subscriberParams?.default_sg_drop_pct,
        defaultTsgEnabled: createDto.trailingStopGain !== undefined
          ? createDto.trailingStopGain
          : (subscriberParams?.default_tsg_enabled || false),
        defaultTsgActivationPct: createDto.trailingStopGainActivationPct || subscriberParams?.default_tsg_activation_pct,
        defaultTsgDropPct: createDto.trailingStopGainDropPct || subscriberParams?.default_tsg_drop_pct,
        trailingStopEnabled: createDto.trailingStop || false,
        trailingDistancePct: createDto.trailingDistancePct,
        minProfitPct: createDto.minProfitPct ?? createDto.min_profit_pct,
        groupPositionsEnabled: groupPositionsEnabled,
        groupPositionsIntervalMinutes: groupPositionsIntervalMinutes ? Number(groupPositionsIntervalMinutes) : undefined,
        vaultId: createDto.vaultId 
          ? Number(createDto.vaultId) 
          : (subscriberParams?.default_vault_id || undefined),
      };

      return this.tradeParametersService.getDomainService().createParameter(mappedDto);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('[TradeParameters] Erro ao criar:', error);
      throw new BadRequestException(error.message || 'Erro ao criar parâmetro de trading');
    }
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualizar parâmetro de trading',
    description: 'Atualiza um parâmetro de trading existente. Apenas campos fornecidos serão atualizados.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do parâmetro de trading', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Parâmetro atualizado com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Parâmetro não encontrado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para atualizar este parâmetro' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() updateDto: any
  ): Promise<any> {
    try {
      // Verificar se o parâmetro existe e pertence ao usuário
      const parameter = await this.prisma.tradeParameter.findFirst({
        where: {
          id,
          user_id: user.userId,
        },
      });

      if (!parameter) {
        throw new NotFoundException('Parâmetro de trading não encontrado');
      }

      // Validar vault se fornecido
      if (updateDto.vaultId || updateDto.vault_id) {
        const vaultId = Number(updateDto.vaultId || updateDto.vault_id);
        if (isNaN(vaultId)) {
          throw new BadRequestException('ID do cofre inválido');
        }
        
        const vault = await this.prisma.vault.findFirst({
          where: {
            id: vaultId,
            user_id: user.userId,
          },
        });

        if (!vault) {
          throw new NotFoundException('Cofre não encontrado');
        }
      }

      // Validar agrupamento de posições
      const groupPositionsEnabled = updateDto.groupPositionsEnabled ?? updateDto.group_positions_enabled;
      const groupPositionsIntervalMinutes = updateDto.groupPositionsIntervalMinutes ?? updateDto.group_positions_interval_minutes;
      
      // Se estiver habilitando agrupamento, validar intervalo
      if (groupPositionsEnabled !== undefined) {
        const finalGroupEnabled = groupPositionsEnabled === true || groupPositionsEnabled === 'true';
        const finalInterval = groupPositionsIntervalMinutes !== undefined 
          ? Number(groupPositionsIntervalMinutes) 
          : (parameter.group_positions_enabled ? parameter.group_positions_interval_minutes : null);
        
        if (finalGroupEnabled && (!finalInterval || finalInterval <= 0)) {
          throw new BadRequestException('Intervalo de agrupamento (group_positions_interval_minutes) é obrigatório e deve ser maior que zero quando agrupamento de posições estiver habilitado');
        }
      }

      // Preparar dados de atualização
      const updateData: any = {};
      if (updateDto.symbol !== undefined) updateData.symbol = updateDto.symbol;
      if (updateDto.side !== undefined) updateData.side = updateDto.side;
      
      // Mapear campos do frontend (orderSizeType e orderSizeValue) para o formato do backend
      // ✅ BUG-ALTO-004 FIX: Validação completa de parseFloat com limites min/max e isFinite
      if (updateDto.orderSizeType !== undefined || updateDto.orderSizeValue !== undefined) {
        const orderSizeType = updateDto.orderSizeType;
        // Converter orderSizeValue para número explicitamente
        const orderSizeValue = updateDto.orderSizeValue !== undefined 
          ? (typeof updateDto.orderSizeValue === 'string' ? parseFloat(updateDto.orderSizeValue) : Number(updateDto.orderSizeValue))
          : undefined;
        
        if (orderSizeType === 'FIXED' && orderSizeValue !== undefined) {
          // Validar valor fixo: deve ser positivo, finito e não NaN
          if (isNaN(orderSizeValue) || !isFinite(orderSizeValue) || orderSizeValue <= 0 || orderSizeValue > 1000000) {
            throw new BadRequestException('orderSizeValue deve ser um número positivo, finito e menor que 1.000.000 quando orderSizeType é FIXED');
          }
          // Se for FIXED, definir quote_amount_fixed e limpar quote_amount_pct_balance
          updateData.quote_amount_fixed = orderSizeValue;
          updateData.quote_amount_pct_balance = null;
        } else if ((orderSizeType === 'PERCENT_BALANCE' || orderSizeType === 'PERCENT') && orderSizeValue !== undefined) {
          // Validar percentual: deve estar entre 0 e 100, finito e não NaN
          if (isNaN(orderSizeValue) || !isFinite(orderSizeValue) || orderSizeValue < 0 || orderSizeValue > 100) {
            throw new BadRequestException('orderSizeValue deve ser um número entre 0 e 100, finito, quando orderSizeType é PERCENT');
          }
          // Se for PERCENT, definir quote_amount_pct_balance e limpar quote_amount_fixed
          updateData.quote_amount_pct_balance = orderSizeValue;
          updateData.quote_amount_fixed = null;
        }
      } else {
        // Se não veio orderSizeType, usar os campos diretos (compatibilidade com API antiga)
        if (updateDto.quote_amount_fixed !== undefined) {
          const value = typeof updateDto.quote_amount_fixed === 'string' 
            ? parseFloat(updateDto.quote_amount_fixed) 
            : Number(updateDto.quote_amount_fixed);
          if (isNaN(value) || !isFinite(value) || value <= 0 || value > 1000000) {
            throw new BadRequestException('quote_amount_fixed deve ser um número positivo, finito e menor que 1.000.000');
          }
          updateData.quote_amount_fixed = value;
        }
        if (updateDto.quote_amount_pct_balance !== undefined) {
          const value = typeof updateDto.quote_amount_pct_balance === 'string' 
            ? parseFloat(updateDto.quote_amount_pct_balance) 
            : Number(updateDto.quote_amount_pct_balance);
          if (isNaN(value) || !isFinite(value) || value < 0 || value > 100) {
            throw new BadRequestException('quote_amount_pct_balance deve ser um número entre 0 e 100, finito');
          }
          updateData.quote_amount_pct_balance = value;
        }
      }
      if (updateDto.max_orders_per_hour !== undefined) updateData.max_orders_per_hour = updateDto.max_orders_per_hour;
      if (updateDto.min_interval_sec !== undefined) updateData.min_interval_sec = updateDto.min_interval_sec;
      if (updateDto.order_type_default !== undefined) updateData.order_type_default = updateDto.order_type_default;
      if (updateDto.slippage_bps !== undefined) updateData.slippage_bps = updateDto.slippage_bps;
      if (updateDto.default_sl_enabled !== undefined) updateData.default_sl_enabled = updateDto.default_sl_enabled;
      if (updateDto.default_sl_pct !== undefined) updateData.default_sl_pct = updateDto.default_sl_pct;
      if (updateDto.stopLoss !== undefined || updateDto.stopLossPercent !== undefined) {
        updateData.default_sl_enabled = true;
        updateData.default_sl_pct = updateDto.stopLossPercent || updateDto.stopLoss;
      }
      if (updateDto.default_tp_enabled !== undefined) updateData.default_tp_enabled = updateDto.default_tp_enabled;
      if (updateDto.default_tp_pct !== undefined) updateData.default_tp_pct = updateDto.default_tp_pct;
      if (updateDto.takeProfit !== undefined || updateDto.takeProfitPercent !== undefined) {
        updateData.default_tp_enabled = true;
        updateData.default_tp_pct = updateDto.takeProfitPercent || updateDto.takeProfit;
      }
      if (updateDto.default_sg_enabled !== undefined) updateData.default_sg_enabled = updateDto.default_sg_enabled;
      if (updateDto.default_sg_pct !== undefined) updateData.default_sg_pct = updateDto.default_sg_pct;
      if (updateDto.stopGain !== undefined || updateDto.stopGainPercent !== undefined) {
        updateData.default_sg_enabled = true;
        updateData.default_sg_pct = updateDto.stopGainPercent || updateDto.stopGain;
      }
      if (updateDto.default_sg_drop_pct !== undefined) updateData.default_sg_drop_pct = updateDto.default_sg_drop_pct;
      if (updateDto.stopGainDropPercent !== undefined) updateData.default_sg_drop_pct = updateDto.stopGainDropPercent;
      if (updateDto.default_tsg_enabled !== undefined) updateData.default_tsg_enabled = updateDto.default_tsg_enabled;
      if (updateDto.trailingStopGain !== undefined) updateData.default_tsg_enabled = updateDto.trailingStopGain;
      if (updateDto.default_tsg_activation_pct !== undefined) updateData.default_tsg_activation_pct = updateDto.default_tsg_activation_pct;
      if (updateDto.trailingStopGainActivationPct !== undefined) updateData.default_tsg_activation_pct = updateDto.trailingStopGainActivationPct;
      if (updateDto.default_tsg_drop_pct !== undefined) updateData.default_tsg_drop_pct = updateDto.default_tsg_drop_pct;
      if (updateDto.trailingStopGainDropPct !== undefined) updateData.default_tsg_drop_pct = updateDto.trailingStopGainDropPct;
      if (updateDto.trailing_stop_enabled !== undefined) updateData.trailing_stop_enabled = updateDto.trailing_stop_enabled;
      if (updateDto.trailing_distance_pct !== undefined) updateData.trailing_distance_pct = updateDto.trailing_distance_pct;
      if (updateDto.min_profit_pct !== undefined || updateDto.minProfitPct !== undefined) {
        const minProfitPct = updateDto.min_profit_pct !== undefined ? updateDto.min_profit_pct : updateDto.minProfitPct;
        // Não permitir remover ou definir como null/zero
        if (minProfitPct === null || minProfitPct === undefined || minProfitPct <= 0) {
          throw new BadRequestException('Lucro mínimo (min_profit_pct) é obrigatório e deve ser maior que zero. Não é permitido remover ou definir como zero.');
        }
        updateData.min_profit_pct = minProfitPct;
      }
      if (groupPositionsEnabled !== undefined) {
        updateData.group_positions_enabled = groupPositionsEnabled === true || groupPositionsEnabled === 'true';
      }
      if (groupPositionsIntervalMinutes !== undefined) {
        const interval = Number(groupPositionsIntervalMinutes);
        updateData.group_positions_interval_minutes = isNaN(interval) ? null : interval;
      }
      if (updateDto.vaultId !== undefined || updateDto.vault_id !== undefined) {
        const vaultId = Number(updateDto.vaultId || updateDto.vault_id);
        updateData.vault_id = isNaN(vaultId) ? null : vaultId;
      }

      const updated = await this.prisma.tradeParameter.update({
        where: { id },
        data: updateData,
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
            },
          },
          vault: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return updated;
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      const errorMessage = error?.message || 'Erro ao atualizar parâmetro';
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Parâmetro de trading não encontrado');
      }

      throw new BadRequestException('Erro ao atualizar parâmetro de trading');
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deletar parâmetro de trading',
    description: 'Remove um parâmetro de trading. Esta ação não pode ser desfeita.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do parâmetro de trading', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Parâmetro deletado com sucesso',
    schema: {
      example: {
        message: 'Parâmetro de trading deletado com sucesso',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Parâmetro não encontrado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para deletar este parâmetro' })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    try {
      // Verificar se o parâmetro existe e pertence ao usuário
      const parameter = await this.prisma.tradeParameter.findFirst({
        where: {
          id,
          user_id: user.userId,
        },
      });

      if (!parameter) {
        throw new NotFoundException('Parâmetro de trading não encontrado');
      }

      // Deletar parâmetro
      await this.prisma.tradeParameter.delete({
        where: { id },
      });

      return { message: 'Parâmetro de trading deletado com sucesso' };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      const errorMessage = error?.message || 'Erro ao deletar parâmetro';
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Parâmetro de trading não encontrado');
      }

      throw new BadRequestException('Erro ao deletar parâmetro de trading');
    }
  }
}

