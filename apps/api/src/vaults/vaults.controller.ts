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
  @ApiOperation({ summary: 'Listar cofres' })
  @ApiResponse({ status: 200, description: 'Lista de cofres' })
  async list(@CurrentUser() user: any) {
    return this.vaultsService
      .getDomainService()
      .getVaultsByUser(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar cofre' })
  @ApiResponse({ status: 201, description: 'Cofre criado' })
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
  @ApiOperation({ summary: 'Obter cofre por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Cofre encontrado' })
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    return this.vaultsService
      .getDomainService()
      .getVaultById(id, user.userId);
  }

  @Get(':id/balances')
  @ApiOperation({ summary: 'Obter saldos do cofre' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Saldos do cofre' })
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
  @ApiOperation({ summary: 'Obter transações do cofre' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Transações do cofre' })
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
  @ApiOperation({ summary: 'Depositar no cofre' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Depósito realizado' })
  async deposit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() depositDto: DepositDto
  ) {
    await this.vaultsService.getDomainService().deposit({
      vaultId: id,
      ...depositDto,
    });
    return { message: 'Deposit successful' };
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Sacar do cofre' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Saque realizado' })
  async withdraw(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() withdrawDto: WithdrawDto
  ) {
    await this.vaultsService.getDomainService().withdraw({
      vaultId: id,
      ...withdrawDto,
    });
    return { message: 'Withdrawal successful' };
  }
}

