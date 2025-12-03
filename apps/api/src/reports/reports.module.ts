import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '@mvcashnode/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService, JwtAuthGuard],
  exports: [ReportsService],
})
export class ReportsModule {}

