import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import {
  AuthService as DomainAuthService,
  UserService as DomainUserService,
  AuditService as DomainAuditService,
} from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';

@Injectable()
export class AuthService {
  private domainAuthService: DomainAuthService;
  private domainUserService: DomainUserService;
  private domainAuditService: DomainAuditService;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService
  ) {
    this.domainAuthService = new DomainAuthService(
      prisma,
      encryptionService,
      configService.get<string>('JWT_SECRET')!,
      configService.get<string>('JWT_REFRESH_SECRET')!,
      parseInt(configService.get<string>('JWT_EXPIRES_IN', '3600')),
      parseInt(configService.get<string>('JWT_REFRESH_EXPIRES_IN', '604800'))
    );

    this.domainUserService = new DomainUserService(prisma, this.domainAuthService);
    this.domainAuditService = new DomainAuditService(prisma);
  }

  getDomainAuthService(): DomainAuthService {
    return this.domainAuthService;
  }

  getDomainUserService(): DomainUserService {
    return this.domainUserService;
  }

  getDomainAuditService(): DomainAuditService {
    return this.domainAuditService;
  }
}

