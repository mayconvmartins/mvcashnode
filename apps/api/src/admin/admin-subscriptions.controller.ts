import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';

@ApiTags('Admin - Subscriptions')
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSubscriptionsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as assinaturas' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status' })
  @ApiQuery({ name: 'plan_id', required: false, description: 'Filtrar por plano' })
  @ApiResponse({ status: 200, description: 'Lista de assinaturas' })
  async list(
    @Query('status') status?: string,
    @Query('plan_id') planId?: string
  ) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // Criar migration com modelos: SubscriptionPlan, Subscription, SubscriptionPayment, SubscriberProfile, SubscriberParameters
    return []; // Temporário até criar modelos no schema
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes da assinatura' })
  async get(@Param('id', ParseIntPipe) id: number) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Assinatura atualizada' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      status?: string;
      start_date?: string;
      end_date?: string;
      auto_renew?: boolean;
    }
  ) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Assinatura cancelada' })
  async cancel(@Param('id', ParseIntPipe) id: number) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
  }

  @Post(':id/extend')
  @ApiOperation({ summary: 'Estender validade da assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Validade estendida' })
  async extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { days: number }
  ) {
    if (!body.days || body.days <= 0) {
      throw new BadRequestException('Número de dias deve ser maior que zero');
    }

    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Histórico de pagamentos da assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Histórico de pagamentos' })
  async getPayments(@Param('id', ParseIntPipe) id: number) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
  }
}
