import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, NotFoundException } from '@nestjs/common';
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
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Admin')
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminAuditController {
  constructor(
    private adminService: AdminService,
    private prisma: PrismaService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Logs de auditoria de usuários' })
  @ApiQuery({ name: 'user_id', required: false, type: Number })
  @ApiQuery({ name: 'entity_type', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Logs de auditoria' })
  async getAuditLogs(
    @Query('user_id') userId?: number,
    @Query('entity_type') entityType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.adminService.getDomainAuditService().getUserAuditLogs(
      userId || 0,
      {
        entityType: entityType as any,
        action: action as any,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
      page && limit ? { page, limit } : undefined
    );
  }

  @Get('system')
  @ApiOperation({ summary: 'Logs de auditoria do sistema' })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'severity', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Logs do sistema' })
  async getSystemAuditLogs(
    @Query('service') service?: string,
    @Query('severity') severity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.adminService.getDomainAuditService().getSystemAuditLogs(
      {
        service: service as any,
        severity: severity as any,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
      page && limit ? { page, limit } : undefined
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter log de auditoria por ID',
    description: 'Retorna os detalhes completos de um log de auditoria específico.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do log de auditoria', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Log de auditoria encontrado',
    schema: {
      example: {
        id: 1,
        user_id: 1,
        entity_type: 'EXCHANGE_ACCOUNT',
        entity_id: 1,
        action: 'CREATE',
        details_json: { label: 'Binance Spot Real' },
        ip: '192.168.1.1',
        user_agent: 'Mozilla/5.0...',
        created_at: '2025-02-12T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Log de auditoria não encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException('Log de auditoria não encontrado');
    }
    return log;
  }
}

