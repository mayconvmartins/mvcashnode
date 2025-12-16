import { Module } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { CryptoLogosService } from './crypto-logos.service';
import { CryptoLogosController } from './crypto-logos.controller';

@Module({
  controllers: [CryptoLogosController],
  providers: [CryptoLogosService, PrismaService],
  exports: [CryptoLogosService],
})
export class CryptoLogosModule {}

