import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Request,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import * as jwt from 'jsonwebtoken';

@ApiTags('Admin')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(
    private adminService: AdminService,
    private prisma: PrismaService,
    private configService: ConfigService
  ) {}

  @Get()
  @ApiOperation({ 
    summary: 'Listar todos os usuários',
    description: 'Retorna uma lista de todos os usuários do sistema com filtros opcionais por role, status ativo e email.'
  })
  @ApiQuery({ name: 'role', required: false, enum: ['admin', 'user'], description: 'Filtrar por role' })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean, description: 'Filtrar por status ativo' })
  @ApiQuery({ name: 'email', required: false, type: String, description: 'Buscar por email' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número da página', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página', example: 20 })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de usuários',
    schema: {
      example: [
        {
          id: 1,
          email: 'admin@example.com',
          is_active: true,
          roles: [{ role: 'admin' }],
          profile: {
            full_name: 'Administrador'
          },
          created_at: '2025-02-12T10:00:00.000Z'
        }
      ]
    }
  })
  async list(
    @Query('role') role?: string,
    @Query('is_active') isActive?: boolean,
    @Query('email') email?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    try {
      const where: any = {};
      
      if (email) {
        where.email = { contains: email };
      }
      
      if (isActive !== undefined) {
        where.is_active = isActive;
      }

      const users = await this.prisma.user.findMany({
        where,
        include: {
          profile: true,
          roles: true,
        },
        orderBy: {
          created_at: 'desc',
        },
        ...(page && limit && {
          skip: (page - 1) * limit,
          take: limit,
        }),
      });

      // Filtrar por role se especificado
      let filteredUsers = users;
      if (role) {
        filteredUsers = users.filter(user => 
          user.roles.some(r => r.role === role)
        );
      }

      return filteredUsers.map(user => ({
        id: user.id,
        email: user.email,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        roles: user.roles.map(r => r.role),
        profile: user.profile,
        created_at: user.created_at,
        updated_at: user.updated_at,
      }));
    } catch (error: any) {
      throw new BadRequestException('Erro ao listar usuários');
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obter usuário por ID',
    description: 'Retorna os detalhes completos de um usuário específico, incluindo perfil e roles.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do usuário', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuário encontrado',
    schema: {
      example: {
        id: 1,
        email: 'admin@example.com',
        is_active: true,
        roles: [{ role: 'admin' }],
        profile: {
          full_name: 'Administrador',
          phone: '+5511999999999'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuário não encontrado',
        error: 'Not Found'
      }
    }
  })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    try {
      const user = await this.adminService.getDomainUserService().getUserById(id);
      
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      return {
        id: user.id,
        email: user.email,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        roles: user.roles.map(r => r.role),
        profile: user.profile,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new NotFoundException('Usuário não encontrado');
    }
  }

  @Post()
  @ApiOperation({ 
    summary: 'Criar novo usuário',
    description: 'Cria um novo usuário no sistema. A senha é obrigatória e será criptografada antes de ser armazenada.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Usuário criado com sucesso',
    schema: {
      example: {
        message: 'Usuário criado com sucesso',
        user: {
          id: 1,
          email: 'novo@example.com'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou senha não fornecida',
    schema: {
      example: {
        statusCode: 400,
        message: 'Senha é obrigatória',
        error: 'Bad Request'
      }
    }
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Email já existe',
    schema: {
      example: {
        statusCode: 409,
        message: 'Email já está em uso',
        error: 'Conflict'
      }
    }
  })
  async create(@Body() createDto: any) {
    try {
      if (!createDto.password || createDto.password.trim() === '') {
        throw new BadRequestException('Senha é obrigatória');
      }

      if (!createDto.email || createDto.email.trim() === '') {
        throw new BadRequestException('Email é obrigatório');
      }

      if (createDto.password.length < 8) {
        throw new BadRequestException('Senha deve ter no mínimo 8 caracteres');
      }

      const user = await this.adminService.getDomainUserService().createUser(createDto);
      return { message: 'Usuário criado com sucesso', user };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao criar usuário';
      
      if (errorMessage.includes('Unique constraint') || errorMessage.includes('email') || errorMessage.includes('already exists')) {
        throw new ConflictException('Email já está em uso');
      }
      
      if (errorMessage.includes('password') || errorMessage.includes('senha')) {
        throw new BadRequestException('Erro ao processar senha: ' + errorMessage);
      }
      
      throw new BadRequestException('Erro ao criar usuário');
    }
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Atualizar usuário',
    description: 'Atualiza os dados de um usuário. Não é possível alterar a senha através deste endpoint (use POST /admin/users/:id/reset-password).'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do usuário', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuário atualizado com sucesso',
    schema: {
      example: {
        id: 1,
        email: 'usuario@example.com',
        is_active: true,
        profile: {
          full_name: 'Nome Atualizado'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuário não encontrado',
        error: 'Not Found'
      }
    }
  })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateDto: any) {
    try {
      const user = await this.adminService.getDomainUserService().updateUser(id, updateDto);
      
      return {
        id: user.id,
        email: user.email,
        is_active: user.is_active,
        roles: user.roles.map(r => r.role),
        profile: user.profile,
        updated_at: user.updated_at,
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao atualizar usuário';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Usuário não encontrado');
      }
      
      if (errorMessage.includes('Unique constraint') || errorMessage.includes('email')) {
        throw new ConflictException('Email já está em uso');
      }
      
      throw new BadRequestException('Erro ao atualizar usuário');
    }
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Desativar usuário',
    description: 'Desativa um usuário (soft delete). O usuário não poderá mais fazer login, mas os dados são mantidos no banco.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do usuário', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuário desativado com sucesso',
    schema: {
      example: {
        message: 'Usuário desativado com sucesso'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuário não encontrado',
        error: 'Not Found'
      }
    }
  })
  async delete(@Param('id', ParseIntPipe) id: number) {
    try {
      const user = await this.adminService.getDomainUserService().getUserById(id);
      
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      await this.adminService.getDomainUserService().deactivateUser(id);
      return { message: 'Usuário desativado com sucesso' };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new NotFoundException('Usuário não encontrado');
    }
  }

  @Post(':id/activate')
  @ApiOperation({ 
    summary: 'Ativar usuário',
    description: 'Reativa um usuário que foi desativado anteriormente.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do usuário', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuário ativado com sucesso',
    schema: {
      example: {
        message: 'Usuário ativado com sucesso'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuário não encontrado',
        error: 'Not Found'
      }
    }
  })
  async activate(@Param('id', ParseIntPipe) id: number) {
    try {
      const user = await this.adminService.getDomainUserService().getUserById(id);
      
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      await this.adminService.getDomainUserService().activateUser(id);
      return { message: 'Usuário ativado com sucesso' };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new NotFoundException('Usuário não encontrado');
    }
  }

  @Post(':id/reset-password')
  @ApiOperation({ 
    summary: 'Forçar alteração de senha',
    description: 'Marca o usuário para que ele precise alterar a senha no próximo login. Não altera a senha atual.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do usuário', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Alteração de senha forçada',
    schema: {
      example: {
        message: 'Usuário precisará alterar a senha no próximo login'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuário não encontrado',
        error: 'Not Found'
      }
    }
  })
  async resetPassword(@Param('id', ParseIntPipe) id: number) {
    try {
      const user = await this.adminService.getDomainUserService().getUserById(id);
      
      if (!user) {
        throw new NotFoundException('Usuário não encontrado');
      }

      await this.adminService.getDomainUserService().forcePasswordChange(id);
      return { message: 'Usuário precisará alterar a senha no próximo login' };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new NotFoundException('Usuário não encontrado');
    }
  }

  @Get(':id/audit-logs')
  @ApiOperation({ summary: 'Logs de auditoria do usuário' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Logs de auditoria' })
  async getAuditLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.adminService.getDomainAuditService().getUserAuditLogs(
      id,
      undefined,
      page && limit ? { page, limit } : undefined
    );
  }

  @Post(':id/impersonate')
  @ApiOperation({ 
    summary: 'Logar como outro usuário',
    description: 'Permite que um admin gere um token de acesso para logar como outro usuário. Útil para verificar posições, contas, etc. Ação registrada em audit log.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do usuário alvo', example: 2 })
  @ApiResponse({ 
    status: 200, 
    description: 'Token de impersonation gerado',
    schema: {
      example: {
        message: 'Token de impersonation gerado com sucesso',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 2,
          email: 'usuario@example.com',
          full_name: 'Nome do Usuário'
        },
        expiresIn: 3600
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Não é possível impersonar a si mesmo ou usuário inativo',
    schema: {
      example: {
        statusCode: 400,
        message: 'Não é possível logar como você mesmo',
        error: 'Bad Request'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuário não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuário não encontrado',
        error: 'Not Found'
      }
    }
  })
  async impersonate(
    @Param('id', ParseIntPipe) targetUserId: number,
    @Request() req: any
  ) {
    const adminUserId = req.user.userId;
    const adminEmail = req.user.email;
    const ip = req.ip || req.connection?.remoteAddress;
    const userAgent = req.get('user-agent');

    try {
      // Verificar se não está tentando impersonar a si mesmo
      if (adminUserId === targetUserId) {
        throw new BadRequestException('Não é possível logar como você mesmo');
      }

      // Buscar usuário alvo
      const targetUser = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          profile: true,
          roles: true,
        },
      });

      if (!targetUser) {
        throw new NotFoundException('Usuário não encontrado');
      }

      if (!targetUser.is_active) {
        throw new BadRequestException('Não é possível logar como um usuário inativo');
      }

      // Gerar token JWT para o usuário alvo
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      const token = jwt.sign(
        {
          userId: targetUser.id,
          email: targetUser.email,
          roles: targetUser.roles.map(r => r.role),
          impersonatedBy: adminUserId,
          isImpersonation: true,
        },
        jwtSecret!,
        { expiresIn: 3600 } // 1 hora
      );

      // Registrar ação em audit log
      await this.adminService.getDomainAuditService().logUserAction({
        userId: adminUserId,
        entityType: 'USER' as any,
        entityId: targetUserId,
        action: 'IMPERSONATE' as any,
        changes: {
          after: {
            admin_user_id: adminUserId,
            admin_email: adminEmail,
            target_user_id: targetUserId,
            target_email: targetUser.email,
          }
        },
        ip,
        userAgent,
      });

      return {
        message: 'Token de impersonation gerado com sucesso',
        accessToken: token,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          full_name: targetUser.profile?.full_name || targetUser.email,
          roles: targetUser.roles.map(r => r.role),
        },
        expiresIn: 3600, // 1 hora
        impersonatedBy: {
          id: adminUserId,
          email: adminEmail,
        }
      };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Erro ao gerar token de impersonation');
    }
  }
}

