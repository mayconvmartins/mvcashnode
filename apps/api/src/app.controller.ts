import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Mensagem de boas-vindas',
    description: 'Retorna uma mensagem de boas-vindas da API'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Mensagem de boas-vindas',
    example: 'Trading Automation API - Bem-vindo!'
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ 
    summary: 'Health check da API',
    description: 'Verifica o status de saúde da API'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'API está funcionando',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2025-02-12T10:00:00.000Z'
      }
    }
  })
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

