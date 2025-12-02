import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { UpdateSLTPDto } from './dto/update-sltp.dto';
import { ClosePositionDto } from './dto/close-position.dto';
import { SellLimitDto } from './dto/sell-limit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Positions')
@Controller('positions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PositionsController {
  constructor(private positionsService: PositionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar posições' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'CLOSED'] })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'exchange_account_id', required: false, type: Number })
  @ApiQuery({ name: 'symbol', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de posições' })
  async list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('trade_mode') tradeMode?: string,
    @Query('exchange_account_id') exchangeAccountId?: number,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    // Implementation would query positions with filters
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter posição por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Posição encontrada' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get position by ID with fills
    return {};
  }

  @Put(':id/sltp')
  @ApiOperation({ summary: 'Atualizar SL/TP da posição' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'SL/TP atualizado' })
  async updateSLTP(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateSLTPDto
  ) {
    return this.positionsService.getDomainService().updateSLTP(
      id,
      updateDto.slEnabled,
      updateDto.slPct,
      updateDto.tpEnabled,
      updateDto.tpPct
    );
  }

  @Put(':id/lock-sell-by-webhook')
  @ApiOperation({ summary: 'Travar venda por webhook' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Lock atualizado' })
  async lockSellByWebhook(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { lock_sell_by_webhook: boolean }
  ) {
    return this.positionsService
      .getDomainService()
      .lockSellByWebhook(id, body.lock_sell_by_webhook);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Fechar posição (total ou parcial)' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 201, description: 'Job de fechamento criado' })
  async close(
    @Param('id', ParseIntPipe) id: number,
    @Body() closeDto?: ClosePositionDto
  ) {
    const result = await this.positionsService
      .getDomainService()
      .closePosition(id, closeDto?.quantity);

    // Create trade job for selling
    // Implementation would create trade job
    return {
      message: 'Job de venda criado com sucesso',
      positionId: result.positionId,
      qtyToClose: result.qtyToClose,
    };
  }

  @Post(':id/sell-limit')
  @ApiOperation({ summary: 'Vender posição com ordem LIMIT' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 201, description: 'Ordem LIMIT criada' })
  async sellLimit(
    @Param('id', ParseIntPipe) id: number,
    @Body() sellLimitDto: SellLimitDto
  ) {
    // Implementation would create limit order trade job
    return {
      message: 'Ordem LIMIT de venda criada com sucesso',
      limitPrice: sellLimitDto.limitPrice,
      quantity: sellLimitDto.quantity,
    };
  }
}

