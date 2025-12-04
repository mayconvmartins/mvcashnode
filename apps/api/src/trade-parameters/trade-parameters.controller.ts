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
    summary: 'Listar parâmetros de trading',
    description: 'Retorna todos os parâmetros de trading configurados para o usuário autenticado.',
  })
  @ApiQuery({ name: 'exchange_account_id', required: false, type: Number, description: 'Filtrar por conta de exchange' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: 'Filtrar por símbolo' })
  @ApiResponse({
    status: 200,
    description: 'Lista de parâmetros de trading',
    schema: {
      example: [
        {
          id: 1,
          user_id: 1,
          exchange_account_id: 1,
          symbol: 'BTCUSDT',
          side: 'BOTH',
          quote_amount_fixed: 100,
          order_type_default: 'MARKET',
          default_sl_enabled: true,
          default_sl_pct: 1.0,
          default_tp_enabled: true,
          default_tp_pct: 2.0,
          exchange_account: {
            id: 1,
            label: 'Binance Spot Real',
            exchange: 'BINANCE_SPOT',
          },
          vault: {
            id: 1,
            name: 'Cofre Real',
          },
        },
      ],
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('exchange_account_id') exchangeAccountId?: number,
    @Query('symbol') symbol?: string
  ): Promise<any> {
    try {
      const where: any = {
        user_id: user.userId,
      };

      if (exchangeAccountId) {
        where.exchange_account_id = exchangeAccountId;
      }

      if (symbol) {
        where.symbol = symbol;
      }

      const parameters = await this.prisma.tradeParameter.findMany({
        where,
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
        orderBy: {
          created_at: 'desc',
        },
      });

      return parameters;
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

      // Mapear campos do frontend para o formato esperado
      const mappedDto = {
        userId: user.userId,
        exchangeAccountId: accountId,
        symbol: createDto.symbol,
        side: createDto.side,
        quoteAmountFixed: 
          createDto.orderSizeType === 'FIXED' ? createDto.orderSizeValue : undefined,
        quoteAmountPctBalance: 
          createDto.orderSizeType === 'PERCENT_BALANCE' ? createDto.orderSizeValue : undefined,
        maxOrdersPerHour: createDto.maxOrdersPerHour,
        minIntervalSec: createDto.minIntervalSec,
        orderTypeDefault: createDto.orderType || 'MARKET',
        slippageBps: createDto.slippageBps,
        defaultSlEnabled: createDto.stopLoss !== undefined || createDto.stopLossPercent !== undefined,
        defaultSlPct: createDto.stopLossPercent || createDto.stopLoss,
        defaultTpEnabled: createDto.takeProfit !== undefined || createDto.takeProfitPercent !== undefined,
        defaultTpPct: createDto.takeProfitPercent || createDto.takeProfit,
        trailingStopEnabled: createDto.trailingStop || false,
        trailingDistancePct: createDto.trailingDistancePct,
        minProfitPct: createDto.minProfitPct ?? createDto.min_profit_pct,
        vaultId: createDto.vaultId ? Number(createDto.vaultId) : undefined,
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

      // Preparar dados de atualização
      const updateData: any = {};
      if (updateDto.symbol !== undefined) updateData.symbol = updateDto.symbol;
      if (updateDto.side !== undefined) updateData.side = updateDto.side;
      if (updateDto.quote_amount_fixed !== undefined) updateData.quote_amount_fixed = updateDto.quote_amount_fixed;
      if (updateDto.quote_amount_pct_balance !== undefined) updateData.quote_amount_pct_balance = updateDto.quote_amount_pct_balance;
      if (updateDto.max_orders_per_hour !== undefined) updateData.max_orders_per_hour = updateDto.max_orders_per_hour;
      if (updateDto.min_interval_sec !== undefined) updateData.min_interval_sec = updateDto.min_interval_sec;
      if (updateDto.order_type_default !== undefined) updateData.order_type_default = updateDto.order_type_default;
      if (updateDto.slippage_bps !== undefined) updateData.slippage_bps = updateDto.slippage_bps;
      if (updateDto.default_sl_enabled !== undefined) updateData.default_sl_enabled = updateDto.default_sl_enabled;
      if (updateDto.default_sl_pct !== undefined) updateData.default_sl_pct = updateDto.default_sl_pct;
      if (updateDto.default_tp_enabled !== undefined) updateData.default_tp_enabled = updateDto.default_tp_enabled;
      if (updateDto.default_tp_pct !== undefined) updateData.default_tp_pct = updateDto.default_tp_pct;
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

