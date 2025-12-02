import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSystemController {
  constructor(
    private adminService: AdminService,
    private prisma: PrismaService
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check do sistema' })
  @ApiResponse({ status: 200, description: 'Status do sistema' })
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Métricas do sistema' })
  @ApiResponse({ status: 200, description: 'Métricas agregadas' })
  async getMetrics() {
    const [totalUsers, activeUsers, openPositions, totalTrades] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { is_active: true } }),
      this.prisma.tradePosition.count({ where: { status: 'OPEN' } }),
      this.prisma.tradeJob.count(),
    ]);

    return {
      totalUsers,
      activeUsers,
      openPositions,
      totalTrades,
      timestamp: new Date().toISOString(),
    };
  }
}

