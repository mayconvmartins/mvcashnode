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
  @ApiOperation({ 
    summary: 'Listar contas de exchange',
    description: 'Retorna todas as contas de exchange do usuário autenticado, incluindo contas reais e de simulação.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de contas de exchange',
    schema: {
      example: [
        {
          id: 1,
          exchange: 'BINANCE_SPOT',
          label: 'Minha Conta Binance',
          is_simulation: false,
          is_active: true,
          testnet: false,
          created_at: '2025-02-12T10:00:00.000Z'
        }
      ]
    }
  })
  async list(@CurrentUser() user: any) {
    return this.exchangeAccountsService
      .getDomainService()
      .getAccountsByUser(user.userId);
  }

  @Post()
  @ApiOperation({ 
    summary: 'Criar conta de exchange',
    description: 'Cria uma nova conta de exchange. As credenciais (API key e secret) são criptografadas antes de serem armazenadas. Para contas de simulação, as credenciais são opcionais.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Conta criada com sucesso',
    schema: {
      example: {
        id: 1,
        exchange: 'BINANCE_SPOT',
        label: 'Minha Conta Binance',
        is_simulation: false,
        is_active: true,
        testnet: false,
        created_at: '2025-02-12T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos',
    schema: {
      example: {
        statusCode: 400,
        message: ['exchange must be a valid enum value'],
        error: 'Bad Request'
      }
    }
  })
  async create(
    @CurrentUser() user: any,
    @Body() createDto: CreateExchangeAccountDto
  ) {
    try {
      return await this.exchangeAccountsService.getDomainService().createAccount({
        ...createDto,
        userId: user.userId,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao criar conta';
      
      if (errorMessage.includes('already exists') || errorMessage.includes('já existe')) {
        throw new BadRequestException('Já existe uma conta com essas credenciais');
      }
      
      if (errorMessage.includes('invalid') || errorMessage.includes('inválido')) {
        throw new BadRequestException('Dados da conta inválidos');
      }
      
      throw new BadRequestException('Erro ao criar conta de exchange');
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obter conta de exchange por ID',
    description: 'Retorna os detalhes de uma conta de exchange específica. Apenas contas do usuário autenticado podem ser acessadas.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da conta de exchange', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Conta encontrada',
    schema: {
      example: {
        id: 1,
        exchange: 'BINANCE_SPOT',
        label: 'Minha Conta Binance',
        is_simulation: false,
        is_active: true,
        testnet: false,
        created_at: '2025-02-12T10:00:00.000Z',
        updated_at: '2025-02-12T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Conta não encontrada ou não pertence ao usuário',
    schema: {
      example: {
        statusCode: 404,
        message: 'Exchange account not found',
        error: 'Not Found'
      }
    }
  })
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    try {
      return await this.exchangeAccountsService
        .getDomainService()
        .getAccountById(id, user.userId);
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao buscar conta';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Conta de exchange não encontrada');
      }
      
      if (errorMessage.includes('permission') || errorMessage.includes('permissão') || errorMessage.includes('access')) {
        throw new ForbiddenException('Você não tem permissão para acessar esta conta');
      }
      
      throw new BadRequestException('Erro ao buscar conta de exchange');
    }
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
    try {
      return await this.exchangeAccountsService
        .getDomainService()
        .updateAccount(id, user.userId, updateDto);
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao atualizar conta';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Conta de exchange não encontrada');
      }
      
      if (errorMessage.includes('permission') || errorMessage.includes('permissão')) {
        throw new ForbiddenException('Você não tem permissão para atualizar esta conta');
      }
      
      throw new BadRequestException('Erro ao atualizar conta de exchange');
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar conta' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Conta deletada' })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    try {
      return await this.exchangeAccountsService
        .getDomainService()
        .deleteAccount(id, user.userId);
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao deletar conta';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Conta de exchange não encontrada');
      }
      
      if (errorMessage.includes('permission') || errorMessage.includes('permissão')) {
        throw new ForbiddenException('Você não tem permissão para deletar esta conta');
      }
      
      throw new BadRequestException('Erro ao deletar conta de exchange');
    }
  }

  @Post(':id/test-connection')
  @ApiOperation({ 
    summary: 'Testar conexão com exchange',
    description: 'Testa a conexão com a exchange usando as credenciais armazenadas. Verifica se a API key e secret são válidas e se a conta tem permissões necessárias.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da conta de exchange', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado do teste de conexão',
    schema: {
      example: {
        success: true,
        message: 'Connection successful'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Falha na conexão',
    schema: {
      example: {
        success: false,
        message: 'Connection failed',
        error: 'Invalid API credentials'
      }
    }
  })
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

