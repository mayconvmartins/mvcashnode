import { Controller, Get, Param, UseGuards, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Webhooks')
@Controller('webhook-events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhookEventsController {
  constructor(private webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar webhook events' })
  @ApiQuery({ name: 'webhookSourceId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de webhook events' })
  async list(
    @Query('webhookSourceId') webhookSourceId?: number,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    // Implementation would list webhook events with filters
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter webhook event por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Webhook event encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get webhook event by ID
    return {};
  }
}

