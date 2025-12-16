import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CryptoLogosService } from './crypto-logos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Crypto Logos')
@Controller('crypto-logos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CryptoLogosController {
  constructor(private readonly cryptoLogosService: CryptoLogosService) {}

  @Get(':symbol')
  @ApiOperation({ summary: 'Get logo URL for a cryptocurrency symbol' })
  @ApiResponse({
    status: 200,
    description: 'Logo URL retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', example: 'BTC' },
        logoUrl: { type: 'string', example: 'http://localhost:4010/logos/btc_a1b2c3d4.png' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Logo not found' })
  async getLogo(@Param('symbol') symbol: string) {
    const logoUrl = await this.cryptoLogosService.getLogoUrl(symbol);
    
    return {
      symbol: symbol.toUpperCase().replace(/USDT$/i, ''),
      logoUrl,
    };
  }

  @Post('batch')
  @ApiOperation({ summary: 'Get logo URLs for multiple cryptocurrency symbols' })
  @ApiResponse({
    status: 200,
    description: 'Logo URLs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        logos: {
          type: 'object',
          example: {
            'BTC': 'http://localhost:4010/logos/btc_a1b2c3d4.png',
            'ETH': 'http://localhost:4010/logos/eth_e5f6g7h8.png',
            'BNB': 'http://localhost:4010/logos/bnb_i9j0k1l2.png',
          },
        },
      },
    },
  })
  async getLogoBatch(@Body() body: { symbols: string[] }) {
    const { symbols } = body;
    
    if (!symbols || !Array.isArray(symbols)) {
      return { logos: {} };
    }

    const logos = await this.cryptoLogosService.getLogosForSymbols(symbols);
    
    return { logos };
  }

  @Get('refresh/:symbol')
  @ApiOperation({ summary: 'Force refresh logo for a cryptocurrency symbol' })
  @ApiResponse({
    status: 200,
    description: 'Logo refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', example: 'BTC' },
        logoUrl: { type: 'string', example: 'http://localhost:4010/logos/btc_a1b2c3d4.png' },
        message: { type: 'string', example: 'Logo refreshed successfully' },
      },
    },
  })
  async refreshLogo(@Param('symbol') symbol: string) {
    const logoUrl = await this.cryptoLogosService.refreshLogo(symbol);
    
    return {
      symbol: symbol.toUpperCase().replace(/USDT$/i, ''),
      logoUrl,
      message: logoUrl ? 'Logo refreshed successfully' : 'Failed to refresh logo',
    };
  }
}

