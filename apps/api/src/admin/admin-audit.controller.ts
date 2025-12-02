import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
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
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminAuditController {
  constructor(private adminService: AdminService) {}

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
  @ApiOperation({ summary: 'Obter log de auditoria por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Log encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get audit log by ID
    return {};
  }
}

