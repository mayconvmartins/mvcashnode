import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TradeParametersService } from './trade-parameters.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Trade Parameters')
@Controller('trade-parameters')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TradeParametersController {
  constructor(private tradeParametersService: TradeParametersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar parâmetros de trading' })
  @ApiResponse({ status: 200, description: 'Lista de parâmetros' })
  async list(@CurrentUser() user: any) {
    // Implementation would list trade parameters
    return [];
  }

  @Post()
  @ApiOperation({ summary: 'Criar parâmetro de trading' })
  @ApiResponse({ status: 201, description: 'Parâmetro criado' })
  async create(@CurrentUser() user: any, @Body() createDto: any) {
    return this.tradeParametersService.getDomainService().createParameter(createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar parâmetro' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Parâmetro atualizado' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateDto: any) {
    // Implementation would update parameter
    return {};
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar parâmetro' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Parâmetro deletado' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    // Implementation would delete parameter
    return { message: 'Deleted' };
  }
}

