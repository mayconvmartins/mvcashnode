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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Exchange Accounts')
@Controller('exchange-accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExchangeAccountsController {
  constructor(
    private exchangeAccountsService: ExchangeAccountsService,
    private prisma: PrismaService
  ) {}

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
    const accounts = await this.exchangeAccountsService
      .getDomainService()
      .getAccountsByUser(user.userId);
    
    // Mapear is_simulation para trade_mode
    return accounts.map(account => ({
      ...account,
      trade_mode: account.is_simulation ? 'SIMULATION' : 'REAL',
    }));
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Listar todas as contas de exchange (Admin)',
    description: 'Retorna todas as contas de exchange de todos os usuários. Apenas para administradores.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de todas as contas de exchange',
  })
  async listAll(@CurrentUser() user: any): Promise<any[]> {
    const isAdmin = user.roles?.includes(UserRole.ADMIN);
    if (!isAdmin) {
      throw new ForbiddenException('Apenas administradores podem acessar este endpoint');
    }

    const accounts = await this.prisma.exchangeAccount.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    
    // Mapear is_simulation para trade_mode e incluir informações do usuário
    return accounts.map(account => {
      const { user, ...accountData } = account;
      return {
        ...accountData,
        trade_mode: account.is_simulation ? 'SIMULATION' : 'REAL',
        user_email: user.email,
        user_id: user.id,
      };
    });
  }

  @Post()
  @ApiOperation({ 
    summary: 'Criar conta de exchange',
    description: `Cria uma nova conta de exchange. As credenciais (API key e secret) são criptografadas antes de serem armazenadas. 
    
**Campos aceitos:**
- \`exchange\`: Tipo de exchange (BINANCE_SPOT, BYBIT_SPOT, etc.) - **obrigatório**
- \`label\`: Nome da conta - **obrigatório**
- \`tradeMode\`: "REAL" ou "SIMULATION" - **recomendado** (ou use \`isSimulation\`)
- \`apiKey\`: API Key da exchange - **obrigatório para contas reais**
- \`apiSecret\`: API Secret da exchange - **obrigatório para contas reais**
- \`isTestnet\`: true/false - se usa testnet da exchange
- \`isActive\`: true/false - se conta fica ativa imediatamente
- \`proxyUrl\`: URL do proxy (opcional)
- \`initialBalances\`: Saldos iniciais para simulação (opcional)

**Exemplo de requisição:**
\`\`\`json
{
  "label": "Minha Conta Bybit",
  "exchange": "BYBIT_SPOT",
  "tradeMode": "REAL",
  "apiKey": "sua-api-key",
  "apiSecret": "seu-api-secret",
  "isTestnet": false,
  "isActive": true
}
\`\`\`
`
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Conta criada com sucesso',
    schema: {
      example: {
        id: 1,
        exchange: 'BYBIT_SPOT',
        label: 'Minha Conta Bybit',
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
      // Verificar se é assinante
      const isSubscriber = user.roles && user.roles.includes('subscriber');
      
      // Assinantes não podem usar modo simulação
      if (isSubscriber) {
        if (createDto.tradeMode === 'SIMULATION' || createDto.isSimulation === true) {
          throw new ForbiddenException('Assinantes não podem criar contas em modo simulação');
        }
      }

      // Mapear campos do frontend para o formato esperado pelo domain service
      const mappedDto: any = {
        exchange: createDto.exchange,
        label: createDto.label,
        userId: user.userId,
        apiKey: createDto.apiKey,
        apiSecret: createDto.apiSecret,
        proxyUrl: createDto.proxyUrl,
        initialBalances: createDto.initialBalances,
      };

      // Mapear tradeMode para isSimulation
      if (createDto.tradeMode !== undefined) {
        mappedDto.isSimulation = createDto.tradeMode === 'SIMULATION';
      } else if (createDto.isSimulation !== undefined) {
        mappedDto.isSimulation = createDto.isSimulation;
      } else {
        // Default: se não especificado, assume REAL (não simulação)
        // Para assinantes, sempre REAL
        mappedDto.isSimulation = false;
      }

      // Mapear isTestnet para testnet
      if (createDto.isTestnet !== undefined) {
        mappedDto.testnet = createDto.isTestnet;
      } else if (createDto.testnet !== undefined) {
        mappedDto.testnet = createDto.testnet;
      } else {
        mappedDto.testnet = false;
      }

      // isActive será tratado pelo domain service se necessário
      if (createDto.isActive !== undefined) {
        mappedDto.isActive = createDto.isActive;
      }

      // Aplicar parâmetros padrão de assinantes se for assinante
      const createdAccount = await this.exchangeAccountsService.getDomainService().createAccount(mappedDto);
      
      if (isSubscriber) {
        // TODO: Modelos Subscription ainda não foram criados no schema Prisma
        // Buscar parâmetros padrão do assinante
        // const subscriberParams = await this.prisma.subscriberParameters.findUnique({
        //   where: { user_id: user.userId },
        // });
        // if (subscriberParams) {
        //   // Se tiver default_exchange_account_id configurado, atualizar
        //   if (!subscriberParams.default_exchange_account_id) {
        //     await this.prisma.subscriberParameters.update({
        //       where: { user_id: user.userId },
        //       data: { default_exchange_account_id: createdAccount.id },
        //     });
        //   }
        // }
      }

      return createdAccount;
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
      // Mapear campos do frontend para o formato esperado pelo domain service
      const mappedDto: any = {
        label: updateDto.label,
        apiKey: updateDto.apiKey,
        apiSecret: updateDto.apiSecret,
        proxyUrl: updateDto.proxyUrl,
        testnet: updateDto.testnet,
        isActive: updateDto.isActive,
        initialBalances: updateDto.initialBalances,
        feeRateBuyLimit: updateDto.feeRateBuyLimit,
        feeRateBuyMarket: updateDto.feeRateBuyMarket,
        feeRateSellLimit: updateDto.feeRateSellLimit,
        feeRateSellMarket: updateDto.feeRateSellMarket,
      };

      // Mapear tradeMode se fornecido (pode vir do frontend como tradeMode)
      if ((updateDto as any).tradeMode !== undefined) {
        mappedDto.isSimulation = (updateDto as any).tradeMode === 'SIMULATION';
      } else if ((updateDto as any).isSimulation !== undefined) {
        mappedDto.isSimulation = (updateDto as any).isSimulation;
      }

      return await this.exchangeAccountsService
        .getDomainService()
        .updateAccount(id, user.userId, mappedDto);
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
        message: 'Connection successful. API key validated and account accessible.'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Falha na conexão com detalhes do erro',
    schema: {
      example: {
        success: false,
        message: 'Connection failed: INVALID_API_KEY',
        error: 'API Key is invalid or has been deleted'
      }
    }
  })
  async testConnection(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    const result = await this.exchangeAccountsService.testConnection(
      id,
      user.userId
    );
    return result;
  }

  @Get(':id/balances')
  @ApiOperation({ 
    summary: 'Obter saldos da conta',
    description: 'Retorna os saldos sincronizados da conta de exchange armazenados no cache local.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da conta de exchange', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Saldos obtidos com sucesso',
    schema: {
      example: {
        success: true,
        balances: {
          BTC: { free: 0.5, locked: 0.1, lastSync: '2025-12-02T16:00:00.000Z' },
          USDT: { free: 1000, locked: 200, lastSync: '2025-12-02T16:00:00.000Z' }
        },
        lastSync: '2025-12-02T16:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Conta não encontrada',
    schema: {
      example: {
        statusCode: 404,
        message: 'Exchange account not found',
        error: 'Not Found'
      }
    }
  })
  async getBalances(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    return await this.exchangeAccountsService.getBalances(id, user.userId);
  }

  @Post(':id/sync-balances')
  @ApiOperation({ 
    summary: 'Sincronizar saldos da exchange',
    description: 'Força sincronização manual dos saldos da conta de exchange. Busca os saldos atuais da API da exchange e atualiza o cache local.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da conta de exchange', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Saldos sincronizados com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Balances synced successfully',
        balances: {
          BTC: { free: 0.5, locked: 0.1 },
          USDT: { free: 1000, locked: 200 }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Conta não encontrada',
    schema: {
      example: {
        statusCode: 404,
        message: 'Exchange account not found',
        error: 'Not Found'
      }
    }
  })
  async syncBalances(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    return await this.exchangeAccountsService.syncBalances(id, user.userId);
  }

  @Post(':id/sync-positions')
  @ApiOperation({ 
    summary: 'Sincronizar posições abertas da exchange',
    description: 'Força sincronização manual das posições abertas da conta de exchange. Busca posições ativas na exchange e atualiza o banco de dados.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da conta de exchange', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Posições sincronizadas com sucesso',
    schema: {
      example: {
        success: true,
        message: 'Positions synced successfully',
        positionsFound: 3
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Conta não encontrada',
    schema: {
      example: {
        statusCode: 404,
        message: 'Exchange account not found',
        error: 'Not Found'
      }
    }
  })
  async syncPositions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    return await this.exchangeAccountsService.syncPositions(id, user.userId);
  }

  @Put(':id/fee-rates')
  @ApiOperation({ 
    summary: 'Atualizar taxas da conta',
    description: 'Atualiza as taxas configuradas para esta conta de exchange. Essas taxas serão usadas quando não for possível obter as taxas reais da exchange.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da conta de exchange', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Taxas atualizadas com sucesso',
  })
  async updateFeeRates(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() feeRates: {
      feeRateBuyLimit?: number;
      feeRateBuyMarket?: number;
      feeRateSellLimit?: number;
      feeRateSellMarket?: number;
    }
  ): Promise<any> {
    // Verificar se a conta pertence ao usuário
    const account = await this.prisma.exchangeAccount.findFirst({
      where: {
        id,
        user_id: user.userId,
      },
    });

    if (!account) {
      throw new NotFoundException('Conta de exchange não encontrada');
    }

    // Atualizar apenas os campos de taxa
    const updated = await this.prisma.exchangeAccount.update({
      where: { id },
      data: {
        fee_rate_buy_limit: feeRates.feeRateBuyLimit !== undefined ? feeRates.feeRateBuyLimit : account.fee_rate_buy_limit,
        fee_rate_buy_market: feeRates.feeRateBuyMarket !== undefined ? feeRates.feeRateBuyMarket : account.fee_rate_buy_market,
        fee_rate_sell_limit: feeRates.feeRateSellLimit !== undefined ? feeRates.feeRateSellLimit : account.fee_rate_sell_limit,
        fee_rate_sell_market: feeRates.feeRateSellMarket !== undefined ? feeRates.feeRateSellMarket : account.fee_rate_sell_market,
      },
    });

    return updated;
  }
}

