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
import { EncryptionService } from '@mvcashnode/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import * as bcrypt from 'bcrypt';

@ApiTags('Admin - Subscribers')
@Controller('admin/subscribers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSubscribersController {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os assinantes' })
  @ApiQuery({ name: 'email', required: false, description: 'Filtrar por email' })
  @ApiQuery({ name: 'is_active', required: false, description: 'Filtrar por status ativo' })
  @ApiResponse({ status: 200, description: 'Lista de assinantes' })
  async list(
    @Query('email') email?: string,
    @Query('is_active') isActive?: string
  ) {
    const where: any = {
      roles: {
        some: {
          role: 'subscriber',
        },
      },
    };

    if (email) {
      where.email = { contains: email };
    }

    if (isActive !== undefined) {
      where.is_active = isActive === 'true';
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        roles: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return users;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de um assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes do assinante' })
  async get(@Param('id', ParseIntPipe) id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    // Descriptografar CPF se existir
    // TODO: Descriptografar CPF quando subscriber_profile for implementado no schema
    // Por enquanto, retornar usuário sem modificações
    return user;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar dados do assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Assinante atualizado' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      is_active?: boolean;
      subscriber_profile?: {
        full_name?: string;
        phone?: string;
        whatsapp?: string;
        address_street?: string;
        address_number?: string;
        address_complement?: string;
        address_neighborhood?: string;
        address_city?: string;
        address_state?: string;
        address_zipcode?: string;
      };
    }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    const updates: any = {};

    if (body.is_active !== undefined) {
      updates.is_active = body.is_active;
    }

    if (body.subscriber_profile) {
      // TODO: Implementar quando subscriberProfile for criado
      // await this.prisma.subscriberProfile.updateMany({
      //   where: { user_id: id },
      //   data: body.subscriber_profile,
      // });
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.user.update({
        where: { id },
        data: updates,
      });
    }

    return this.get(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Desativar assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Assinante desativado' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    return this.prisma.user.update({
      where: { id },
      data: { is_active: false },
    });
  }

  @Post(':id/change-password')
  @ApiOperation({ summary: 'Trocar senha do assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Senha alterada' })
  async changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { new_password: string; must_change_password?: boolean }
  ) {
    if (!body.new_password || body.new_password.length < 6) {
      throw new BadRequestException('Senha deve ter pelo menos 6 caracteres');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    const passwordHash = await bcrypt.hash(body.new_password, 12);

    return this.prisma.user.update({
      where: { id },
      data: {
        password_hash: passwordHash,
        must_change_password: body.must_change_password ?? false,
      },
    });
  }

  @Get(':id/parameters')
  @ApiOperation({ summary: 'Ver parâmetros do assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Parâmetros do assinante' })
  async getParameters(@Param('id', ParseIntPipe) id: number) {
    // TODO: Implementar quando subscriberParameters for criado
    // const parameters = await this.prisma.subscriberParameters.findUnique({
    //   where: { user_id: id },
    // });
    const parameters = null; // Temporário até criar modelo

    if (!parameters) {
      throw new NotFoundException('Parâmetros não encontrados para este assinante');
    }

    return parameters;
  }
}
