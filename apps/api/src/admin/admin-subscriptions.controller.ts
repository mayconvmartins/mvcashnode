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
    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (planId) {
      where.plan_id = parseInt(planId);
    }

    return this.prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            is_active: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes da assinatura' })
  async get(@Param('id', ParseIntPipe) id: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            is_active: true,
            created_at: true,
          },
        },
        payments: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    return subscription;
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    const updateData: any = {};
    
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    
    if (body.start_date !== undefined) {
      updateData.start_date = body.start_date ? new Date(body.start_date) : null;
    }
    
    if (body.end_date !== undefined) {
      updateData.end_date = body.end_date ? new Date(body.end_date) : null;
    }
    
    if (body.auto_renew !== undefined) {
      updateData.auto_renew = body.auto_renew;
    }

    return this.prisma.subscription.update({
      where: { id },
      data: updateData,
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            is_active: true,
          },
        },
      },
    });
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Assinatura cancelada' })
  async cancel(@Param('id', ParseIntPipe) id: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    return this.prisma.subscription.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        auto_renew: false,
      },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            is_active: true,
          },
        },
      },
    });
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

    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    const currentEndDate = subscription.end_date || new Date();
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + body.days);

    return this.prisma.subscription.update({
      where: { id },
      data: {
        end_date: newEndDate,
        status: subscription.status === 'EXPIRED' ? 'ACTIVE' : subscription.status,
      },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            is_active: true,
          },
        },
      },
    });
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Histórico de pagamentos da assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Histórico de pagamentos' })
  async getPayments(@Param('id', ParseIntPipe) id: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    return this.prisma.subscriptionPayment.findMany({
      where: { subscription_id: id },
      orderBy: { created_at: 'desc' },
    });
  }
}
