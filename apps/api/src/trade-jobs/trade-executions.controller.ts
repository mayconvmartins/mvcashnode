import { Controller, Get, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TradeJobsService } from './trade-jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Jobs & Executions')
@Controller('trade-executions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TradeExecutionsController {
  constructor(private tradeJobsService: TradeJobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar execuções' })
  @ApiResponse({ status: 200, description: 'Lista de execuções' })
  async list() {
    // Implementation would list executions
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter execução por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Execução encontrada' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get execution by ID
    return {};
  }
}

