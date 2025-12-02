import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TradeJobsService } from './trade-jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Jobs & Executions')
@Controller('trade-jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TradeJobsController {
  constructor(private tradeJobsService: TradeJobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar trade jobs' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiResponse({ status: 200, description: 'Lista de trade jobs' })
  async list(@Query('status') status?: string, @Query('trade_mode') tradeMode?: string) {
    // Implementation would list trade jobs
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter trade job por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Trade job encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get trade job by ID
    return {};
  }
}

