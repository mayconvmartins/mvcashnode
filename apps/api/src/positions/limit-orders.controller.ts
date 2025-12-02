import {
  Controller,
  Get,
  Delete,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Limit Orders')
@Controller('limit-orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LimitOrdersController {
  constructor(private positionsService: PositionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar ordens LIMIT' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING_LIMIT', 'FILLED', 'CANCELED', 'EXPIRED'] })
  @ApiQuery({ name: 'side', required: false, enum: ['BUY', 'SELL'] })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'symbol', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de ordens LIMIT' })
  async list(
    @Query('status') status?: string,
    @Query('side') side?: string,
    @Query('trade_mode') tradeMode?: string,
    @Query('symbol') symbol?: string
  ) {
    // Implementation would query limit orders
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de ordem LIMIT' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes da ordem' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get limit order details
    return {};
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancelar ordem LIMIT' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Ordem cancelada' })
  async cancel(@Param('id', ParseIntPipe) id: number) {
    // Implementation would cancel limit order
    return { message: 'Ordem LIMIT cancelada com sucesso', order_id: id };
  }

  @Get('history')
  @ApiOperation({ summary: 'Histórico de ordens LIMIT' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Histórico de ordens' })
  async history(@Query('from') from?: string, @Query('to') to?: string) {
    // Implementation would get limit orders history
    return [];
  }
}

