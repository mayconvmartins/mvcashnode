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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookSourceDto } from './dto/create-webhook-source.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Webhooks')
@Controller('webhook-sources')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhookSourcesController {
  constructor(private webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar webhook sources' })
  @ApiResponse({ status: 200, description: 'Lista de webhook sources' })
  async list(@CurrentUser() user: any) {
    // Implementation would list all webhook sources for user
    return [];
  }

  @Post()
  @ApiOperation({ summary: 'Criar webhook source' })
  @ApiResponse({ status: 201, description: 'Webhook source criado' })
  async create(
    @CurrentUser() user: any,
    @Body() createDto: CreateWebhookSourceDto
  ) {
    return this.webhooksService.getSourceService().createSource({
      ...createDto,
      ownerUserId: user.userId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter webhook source por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Webhook source encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get webhook source by ID
    return {};
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar webhook source' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Webhook source atualizado' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: Partial<CreateWebhookSourceDto>
  ) {
    // Implementation would update webhook source
    return {};
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar webhook source' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Webhook source deletado' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    // Implementation would delete webhook source
    return { message: 'Deleted' };
  }
}

