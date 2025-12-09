import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsArray, IsInt, Min, IsEnum } from 'class-validator';
import { TradeMode } from '@mvcashnode/shared';

export class CreateWebhookSourceDto {
  @ApiProperty({ example: 'TradingView Alerts' })
  @IsString()
  label: string;

  @ApiProperty({ example: 'my-tradingview-alerts' })
  @IsString()
  webhookCode: string;

  @ApiProperty({ enum: TradeMode, example: TradeMode.REAL })
  @IsEnum(TradeMode)
  tradeMode: TradeMode;

  @ApiProperty({ required: false, example: ['192.168.1.0/24', '203.0.113.0/24'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIPs?: string[];

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  requireSignature?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  signingSecret?: string;

  @ApiProperty({ required: false, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitPerMin?: number;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  alertGroupEnabled?: boolean;

  @ApiProperty({ required: false, example: '120363123456789012@g.us' })
  @IsOptional()
  @IsString()
  alertGroupId?: string;

  @ApiProperty({ required: false, example: false, description: 'Marcar webhook como compartilhado (apenas admins)' })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @ApiProperty({ required: false, example: false, description: 'Ativar monitoramento de preços antes de executar compras' })
  @IsOptional()
  @IsBoolean()
  monitorEnabled?: boolean;
}

