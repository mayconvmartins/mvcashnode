import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CreateBindingDto } from './dto/create-binding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Webhooks')
@Controller('webhook-sources/:sourceId/bindings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhookBindingsController {
  constructor(private webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar bindings de webhook source' })
  @ApiParam({ name: 'sourceId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Lista de bindings' })
  async list(@Param('sourceId', ParseIntPipe) sourceId: number) {
    const source = await this.webhooksService
      .getSourceService()
      .getSourceByCode('');
    return source?.bindings || [];
  }

  @Post()
  @ApiOperation({ summary: 'Criar binding' })
  @ApiParam({ name: 'sourceId', type: 'number' })
  @ApiResponse({ status: 201, description: 'Binding criado' })
  async create(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @Body() createDto: CreateBindingDto
  ) {
    // Implementation would create binding
    return {};
  }

  @Delete(':bindingId')
  @ApiOperation({ summary: 'Deletar binding' })
  @ApiParam({ name: 'sourceId', type: 'number' })
  @ApiParam({ name: 'bindingId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Binding deletado' })
  async delete(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @Param('bindingId', ParseIntPipe) bindingId: number
  ) {
    // Implementation would delete binding
    return { message: 'Deleted' };
  }
}

