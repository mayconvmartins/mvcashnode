import { Module } from '@nestjs/common';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  controllers: [VaultsController],
  providers: [VaultsService, PrismaService, JwtAuthGuard],
  exports: [VaultsService],
})
export class VaultsModule {}

