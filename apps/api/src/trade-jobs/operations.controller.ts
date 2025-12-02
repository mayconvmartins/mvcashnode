import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TradeJobsService } from './trade-jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Jobs & Executions')
@Controller('operations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OperationsController {
  constructor(private tradeJobsService: TradeJobsService) {}

  @Get()
  @ApiOperation({ summary: 'View combinada de jobs e execuções' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de operações' })
  async list(@Query('trade_mode') tradeMode?: string, @Query('status') status?: string) {
    // Implementation would combine jobs and executions
    return [];
  }
}

