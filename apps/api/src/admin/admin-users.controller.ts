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
} from '@nestjs/common';
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

@ApiTags('Admin')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private adminService: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os usuários' })
  @ApiQuery({ name: 'role', required: false, enum: ['admin', 'user'] })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de usuários' })
  async list(
    @Query('role') role?: string,
    @Query('is_active') isActive?: boolean,
    @Query('email') email?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    // Implementation would list users with filters
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter usuário por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Usuário encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getDomainUserService().getUserById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado' })
  async create(@Body() createDto: any) {
    const user = await this.adminService.getDomainUserService().createUser(createDto);
    return { message: 'Usuário criado com sucesso', user };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar usuário' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Usuário atualizado' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateDto: any) {
    return this.adminService.getDomainUserService().updateUser(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar usuário' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Usuário deletado' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.getDomainUserService().deactivateUser(id);
    return { message: 'Usuário desativado' };
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Ativar usuário' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Usuário ativado' })
  async activate(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.getDomainUserService().activateUser(id);
    return { message: 'Usuário ativado' };
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Resetar senha do usuário' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Senha resetada' })
  async resetPassword(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.getDomainUserService().forcePasswordChange(id);
    return { message: 'Senha resetada, usuário deve trocar no próximo login' };
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
}

