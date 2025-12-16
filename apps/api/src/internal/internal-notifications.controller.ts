import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { NotificationWrapperService } from '../notifications/notification-wrapper.service';

/**
 * Controller interno para receber chamadas de notificações de outros serviços (executor, monitors)
 * Não requer autenticação JWT, mas pode usar uma chave secreta interna
 */
@ApiTags('Internal')
@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(
    private notificationWrapper: NotificationWrapperService
  ) {}

  @Post('position-opened')
  @ApiOperation({
    summary: 'Notificar posição aberta (interno)',
    description: 'Endpoint interno chamado pelo executor quando uma posição é aberta',
  })
  @ApiResponse({ status: 200, description: 'Notificação processada' })
  async positionOpened(@Body() data: { positionId: number }) {
    await this.notificationWrapper.sendPositionOpenedAlert(data.positionId);
    return { success: true };
  }

  @Post('position-closed')
  @ApiOperation({
    summary: 'Notificar posição fechada (interno)',
    description: 'Endpoint interno chamado pelo executor quando uma posição é fechada',
  })
  @ApiResponse({ status: 200, description: 'Notificação processada' })
  async positionClosed(@Body() data: { positionId: number }) {
    await this.notificationWrapper.sendPositionClosedAlert(data.positionId);
    return { success: true };
  }

  @Post('stop-loss')
  @ApiOperation({
    summary: 'Notificar Stop Loss acionado (interno)',
    description: 'Endpoint interno chamado pelo monitor quando SL é acionado',
  })
  @ApiResponse({ status: 200, description: 'Notificação processada' })
  async stopLoss(@Body() data: { positionId: number; executionId: number }) {
    await this.notificationWrapper.sendStopLossAlert(data.positionId, data.executionId);
    return { success: true };
  }

  @Post('stop-gain')
  @ApiOperation({
    summary: 'Notificar Stop Gain acionado (interno)',
    description: 'Endpoint interno chamado pelo monitor quando SG é acionado',
  })
  @ApiResponse({ status: 200, description: 'Notificação processada' })
  async stopGain(@Body() data: { positionId: number; executionId: number }) {
    await this.notificationWrapper.sendStopGainAlert(data.positionId, data.executionId);
    return { success: true };
  }

  @Post('partial-tp')
  @ApiOperation({
    summary: 'Notificar Take Profit parcial (interno)',
    description: 'Endpoint interno chamado pelo monitor quando TP parcial é acionado',
  })
  @ApiResponse({ status: 200, description: 'Notificação processada' })
  async partialTP(@Body() data: { positionId: number; executionId: number }) {
    await this.notificationWrapper.sendPartialTPAlert(data.positionId, data.executionId);
    return { success: true };
  }
}

