import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';

@ApiTags('Admin - Subscription Plans')
@Controller('admin/subscription-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSubscriptionPlansController {
  private readonly logger = new Logger(AdminSubscriptionPlansController.name);

  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os planos de assinatura' })
  @ApiResponse({ status: 200, description: 'Lista de planos' })
  async list(): Promise<any[]> {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { price_monthly: 'asc' },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de um plano' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes do plano' })
  async get(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return plan;
  }

  @Post()
  @ApiOperation({ summary: 'Criar novo plano de assinatura' })
  @ApiResponse({ status: 201, description: 'Plano criado com sucesso' })
  async create(
    @Body() body: {
      name: string;
      description?: string;
      price_monthly: number;
      price_quarterly: number;
      duration_days?: number;
      is_active?: boolean;
      features_json?: any;
    }
  ): Promise<any> {
    try {
      if (!body.name || body.price_monthly === undefined || body.price_quarterly === undefined) {
        throw new BadRequestException('Nome, preço mensal e preço trimestral são obrigatórios');
      }

      if (body.price_monthly <= 0 || body.price_quarterly <= 0) {
        throw new BadRequestException('Preços devem ser maiores que zero');
      }

      return await this.prisma.subscriptionPlan.create({
        data: {
          name: body.name.trim(),
          description: body.description?.trim() || null,
          price_monthly: Number(body.price_monthly),
          price_quarterly: Number(body.price_quarterly),
          duration_days: body.duration_days || 30,
          is_active: body.is_active !== undefined ? body.is_active : true,
          features_json: body.features_json || {},
        },
      });
    } catch (error: any) {
      this.logger.error('[AdminSubscriptionPlans] Erro ao criar plano:', error);
      // Log detalhado do erro
      console.error('[AdminSubscriptionPlans] Erro completo:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        body: body,
      });
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao criar plano de assinatura'
      );
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar plano de assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Plano atualizado' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      name?: string;
      description?: string;
      price_monthly?: number;
      price_quarterly?: number;
      duration_days?: number;
      is_active?: boolean;
      features_json?: any;
    }
  ): Promise<any> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    if (body.price_monthly !== undefined && body.price_monthly <= 0) {
      throw new BadRequestException('Preço mensal deve ser maior que zero');
    }

    if (body.price_quarterly !== undefined && body.price_quarterly <= 0) {
      throw new BadRequestException('Preço trimestral deve ser maior que zero');
    }

    const updateData: any = {};
    
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.price_monthly !== undefined) updateData.price_monthly = body.price_monthly;
    if (body.price_quarterly !== undefined) updateData.price_quarterly = body.price_quarterly;
    if (body.duration_days !== undefined) updateData.duration_days = body.duration_days;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.features_json !== undefined) updateData.features_json = body.features_json;

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: updateData,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desativar plano de assinatura' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Plano desativado' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    // Não deletar fisicamente, apenas desativar
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: { is_active: false },
    });
  }
}
