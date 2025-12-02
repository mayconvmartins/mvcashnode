import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ExchangeAccountsService } from './exchange-accounts.service';
import { CreateExchangeAccountDto } from './dto/create-exchange-account.dto';
import { UpdateExchangeAccountDto } from './dto/update-exchange-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Exchange Accounts')
@Controller('exchange-accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExchangeAccountsController {
  constructor(private exchangeAccountsService: ExchangeAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar contas de exchange' })
  @ApiResponse({ status: 200, description: 'Lista de contas' })
  async list(@CurrentUser() user: any) {
    return this.exchangeAccountsService
      .getDomainService()
      .getAccountsByUser(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar conta de exchange' })
  @ApiResponse({ status: 201, description: 'Conta criada' })
  async create(
    @CurrentUser() user: any,
    @Body() createDto: CreateExchangeAccountDto
  ) {
    return this.exchangeAccountsService.getDomainService().createAccount({
      ...createDto,
      userId: user.userId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter conta por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Conta encontrada' })
  @ApiResponse({ status: 404, description: 'Conta não encontrada' })
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    return this.exchangeAccountsService
      .getDomainService()
      .getAccountById(id, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar conta' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Conta atualizada' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() updateDto: UpdateExchangeAccountDto
  ) {
    return this.exchangeAccountsService
      .getDomainService()
      .updateAccount(id, user.userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar conta' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Conta deletada' })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    return this.exchangeAccountsService
      .getDomainService()
      .deleteAccount(id, user.userId);
  }

  @Post(':id/test-connection')
  @ApiOperation({ summary: 'Testar conexão com exchange' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Conexão testada' })
  async testConnection(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    const success = await this.exchangeAccountsService.testConnection(
      id,
      user.userId
    );
    return { success, message: success ? 'Connection successful' : 'Connection failed' };
  }
}

