import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('Admin')
@Controller('admin/ccxt-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class CcxtLogsController {
  private readonly logPath: string;

  constructor() {
    this.logPath = process.env.CCXT_LOG_PATH || path.join(process.cwd(), 'logs', 'ccxt.log');
  }

  @Get()
  @ApiOperation({
    summary: 'Listar logs do CCXT (sanitizados)',
    description: 'Retorna as últimas linhas do arquivo de log CCXT',
  })
  @ApiQuery({ name: 'lines', required: false, description: 'Quantidade de linhas (default: 300)' })
  async listLogs(@Query('lines') lines?: string): Promise<{ entries: any[] }> {
    const totalLines = Math.min(Math.max(parseInt(lines || '300', 10) || 300, 1), 2000);

    if (!fs.existsSync(this.logPath)) {
      return { entries: [] };
    }

    const content = fs.readFileSync(this.logPath, 'utf-8').trim();
    if (!content) return { entries: [] };

    const split = content.split('\n');
    const slice = split.slice(-totalLines);
    const entries = slice
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { ts: new Date().toISOString(), event: 'parse_error', raw: line };
        }
      })
      .filter(Boolean);

    return { entries };
  }
}

