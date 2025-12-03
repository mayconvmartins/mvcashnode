import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
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
import { VaultsService } from './vaults.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Vaults')
@Controller('vaults')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VaultsController {
  constructor(private vaultsService: VaultsService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Listar cofres',
    description: 'Retorna todos os cofres virtuais do usuário autenticado. Cofres são contêineres de capital que podem ser usados para controlar o tamanho das posições e gerenciar risco.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de cofres retornada com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 1 },
          user_id: { type: 'number', example: 1 },
          name: { type: 'string', example: 'Cofre Real' },
          trade_mode: { type: 'string', enum: ['REAL', 'SIMULATION'], example: 'REAL' },
          description: { type: 'string', nullable: true, example: 'Cofre para trading real' },
          created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
        },
      },
    },
  })
  async list(@CurrentUser() user: any) {
    return this.vaultsService
      .getDomainService()
      .getVaultsByUser(user.userId);
  }

  @Post()
  @ApiOperation({ 
    summary: 'Criar cofre',
    description: 'Cria um novo cofre virtual. Cofres permitem controlar o capital disponível para trading e gerenciar risco. Cada cofre pode ter saldos em múltiplos ativos.',
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Cofre criado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        user_id: { type: 'number', example: 1 },
        name: { type: 'string', example: 'Cofre Real' },
        trade_mode: { type: 'string', enum: ['REAL', 'SIMULATION'], example: 'REAL' },
        description: { type: 'string', nullable: true, example: 'Cofre para trading real' },
        created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos',
    schema: {
      example: {
        statusCode: 400,
        message: ['name should not be empty'],
        error: 'Bad Request',
      },
    },
  })
  async create(
    @CurrentUser() user: any,
    @Body() createDto: CreateVaultDto
  ) {
    return this.vaultsService.getDomainService().createVault({
      ...createDto,
      userId: user.userId,
    });
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obter cofre por ID',
    description: 'Retorna os detalhes completos de um cofre específico, incluindo saldos em todos os ativos e informações de transações.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID do cofre',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Cofre encontrado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        user_id: { type: 'number', example: 1 },
        name: { type: 'string', example: 'Cofre Real' },
        trade_mode: { type: 'string', enum: ['REAL', 'SIMULATION'], example: 'REAL' },
        description: { type: 'string', nullable: true, example: 'Cofre para trading real' },
        balances: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              asset: { type: 'string', example: 'USDT' },
              balance: { type: 'number', example: 1000 },
              reserved: { type: 'number', example: 100 },
              available: { type: 'number', example: 900 },
            },
          },
        },
        created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Cofre não encontrado',
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Sem permissão para acessar este cofre',
  })
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    try {
      return await this.vaultsService
        .getDomainService()
        .getVaultById(id, user.userId);
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao buscar cofre';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Cofre não encontrado');
      }
      
      if (errorMessage.includes('permission') || errorMessage.includes('permissão')) {
        throw new ForbiddenException('Você não tem permissão para acessar este cofre');
      }
      
      throw new BadRequestException('Erro ao buscar cofre');
    }
  }

  @Get(':id/balances')
  @ApiOperation({ 
    summary: 'Obter saldos do cofre',
    description: 'Retorna os saldos de todos os ativos no cofre, incluindo valores disponíveis e reservados.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID do cofre',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Saldos retornados com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          asset: { type: 'string', example: 'USDT' },
          balance: { type: 'number', example: 1000, description: 'Saldo total' },
          reserved: { type: 'number', example: 100, description: 'Valor reservado para trades pendentes' },
          available: { type: 'number', example: 900, description: 'Valor disponível para novos trades' },
        },
      },
    },
  })
  async getBalances(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    const vault = await this.vaultsService
      .getDomainService()
      .getVaultById(id, user.userId);
    return vault?.balances || [];
  }

  @Get(':id/transactions')
  @ApiOperation({ 
    summary: 'Obter transações do cofre',
    description: 'Retorna o histórico de transações (depósitos e saques) do cofre com paginação.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID do cofre',
    example: 1
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number,
    description: 'Número da página',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Itens por página',
    example: 20
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Transações retornadas com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 1 },
          vault_id: { type: 'number', example: 1 },
          transaction_type: { type: 'string', enum: ['DEPOSIT', 'WITHDRAW'], example: 'DEPOSIT' },
          asset: { type: 'string', example: 'USDT' },
          amount: { type: 'number', example: 100 },
          balance_after: { type: 'number', example: 1100 },
          created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
        },
      },
    },
  })
  async getTransactions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    // Implementation would query vault_transactions
    // For now, return empty array
    return [];
  }

  @Post(':id/deposit')
  @ApiOperation({ 
    summary: 'Depositar no cofre',
    description: 'Adiciona fundos ao cofre. O valor será adicionado ao saldo disponível do ativo especificado.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID do cofre',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Depósito realizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Depósito realizado com sucesso' },
        transaction: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            asset: { type: 'string', example: 'USDT' },
            amount: { type: 'number', example: 100 },
            balance_after: { type: 'number', example: 1100 },
          },
        },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Valor inválido ou saldo insuficiente',
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Cofre não encontrado',
  })
  async deposit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() depositDto: DepositDto
  ) {
    try {
      await this.vaultsService.getDomainService().deposit({
        vaultId: id,
        ...depositDto,
      });
      return { message: 'Depósito realizado com sucesso' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao depositar';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Cofre não encontrado');
      }
      
      if (errorMessage.includes('insufficient') || errorMessage.includes('insuficiente')) {
        throw new BadRequestException('Saldo insuficiente');
      }
      
      if (errorMessage.includes('invalid') || errorMessage.includes('inválido')) {
        throw new BadRequestException('Valor de depósito inválido');
      }
      
      throw new BadRequestException('Erro ao realizar depósito');
    }
  }

  @Post(':id/withdraw')
  @ApiOperation({ 
    summary: 'Sacar do cofre',
    description: 'Remove fundos do cofre. Apenas valores disponíveis (não reservados) podem ser sacados. Valores reservados para trades pendentes não podem ser sacados.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID do cofre',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Saque realizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Saque realizado com sucesso' },
        transaction: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 2 },
            asset: { type: 'string', example: 'USDT' },
            amount: { type: 'number', example: 50 },
            balance_after: { type: 'number', example: 1050 },
          },
        },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Saldo insuficiente, valor reservado ou valor inválido',
    schema: {
      example: {
        statusCode: 400,
        message: 'Saldo insuficiente para realizar o saque',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Cofre não encontrado',
  })
  async withdraw(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() withdrawDto: WithdrawDto
  ) {
    try {
      await this.vaultsService.getDomainService().withdraw({
        vaultId: id,
        ...withdrawDto,
      });
      return { message: 'Saque realizado com sucesso' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao sacar';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Cofre não encontrado');
      }
      
      if (errorMessage.includes('insufficient') || errorMessage.includes('insuficiente')) {
        throw new BadRequestException('Saldo insuficiente para realizar o saque');
      }
      
      if (errorMessage.includes('reserved') || errorMessage.includes('reservado')) {
        throw new BadRequestException('Valor está reservado e não pode ser sacado');
      }
      
      if (errorMessage.includes('invalid') || errorMessage.includes('inválido')) {
        throw new BadRequestException('Valor de saque inválido');
      }
      
      throw new BadRequestException('Erro ao realizar saque');
    }
  }
}

