import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminSystemController } from './admin-system.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [
    AdminUsersController,
    AdminSystemController,
    AdminAuditController,
  ],
  providers: [
    AdminService,
    PrismaService,
    {
      provide: EncryptionService,
      useFactory: (configService: ConfigService) => {
        const key = configService.get<string>('ENCRYPTION_KEY');
        if (!key || key.length < 32) {
          throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
        }
        return new EncryptionService(key);
      },
      inject: [ConfigService],
    },
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AdminService],
})
export class AdminModule {}

