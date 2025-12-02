import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter dados do usuário atual' })
  @ApiResponse({ status: 200, description: 'Dados do usuário' })
  async getMe(@Request() req: any) {
    const userId = req.user.userId;
    const user = await this.userService.getDomainUserService().getUserById(userId);
    return user;
  }

  @Put('me')
  @ApiOperation({ summary: 'Atualizar dados do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário atualizado' })
  async updateMe(@Request() req: any, @Body() updateDto: any) {
    const userId = req.user.userId;
    
    // Mapear campos do frontend para o formato esperado pelo domain service
    const mappedDto = {
      fullName: updateDto.full_name || updateDto.fullName,
      phone: updateDto.phone,
      whatsappPhone: updateDto.whatsapp_phone || updateDto.whatsappPhone,
      // Não permitir alterar email ou isActive pelo endpoint /users/me
    };
    
    const user = await this.userService.getDomainUserService().updateUser(userId, mappedDto);
    return user;
  }

  @Get('me/login-history')
  @ApiOperation({ summary: 'Histórico de login' })
  @ApiResponse({ status: 200, description: 'Histórico de login' })
  async getLoginHistory(@Request() req: any) {
    const userId = req.user.userId;
    const history = await this.userService.getDomainUserService().getLoginHistory(userId);
    return history;
  }
}

