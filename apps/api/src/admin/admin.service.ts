import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import {
  UserService as DomainUserService,
  AuthService as DomainAuthService,
  AuditService as DomainAuditService,
} from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';

@Injectable()
export class AdminService {
  private domainUserService: DomainUserService;
  private domainAuthService: DomainAuthService;
  private domainAuditService: DomainAuditService;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private configService: ConfigService
  ) {
    this.domainAuthService = new DomainAuthService(
      prisma,
      encryptionService,
      configService.get<string>('JWT_SECRET')!,
      configService.get<string>('JWT_REFRESH_SECRET')!,
      3600,
      604800
    );
    this.domainUserService = new DomainUserService(prisma, this.domainAuthService);
    this.domainAuditService = new DomainAuditService(prisma);
  }

  getDomainUserService(): DomainUserService {
    return this.domainUserService;
  }

  getDomainAuthService(): DomainAuthService {
    return this.domainAuthService;
  }

  getDomainAuditService(): DomainAuditService {
    return this.domainAuditService;
  }
}

