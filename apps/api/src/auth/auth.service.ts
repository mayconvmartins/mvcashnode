import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import {
  AuthService as DomainAuthService,
  UserService as DomainUserService,
  AuditService as DomainAuditService,
  PasskeyService,
  SessionService,
} from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { EmailService } from '@mvcashnode/notifications';

@Injectable()
export class AuthService {
  private domainAuthService: DomainAuthService;
  private domainUserService: DomainUserService;
  private domainAuditService: DomainAuditService;
  private emailService: EmailService;
  private passkeyService: PasskeyService;
  private sessionService: SessionService;

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
    this.passkeyService = new PasskeyService(prisma);
    this.sessionService = new SessionService(prisma);

    // Configurar EmailService
    this.emailService = new EmailService(prisma, {
      host: configService.get<string>('SMTP_HOST') || 'mail.smtp2go.com',
      port: parseInt(configService.get<string>('SMTP_PORT') || '2525'),
      user: configService.get<string>('SMTP_USER') || '',
      password: configService.get<string>('SMTP_PASS') || '',
      from: configService.get<string>('SMTP_FROM') || 'noreply.mvcash@mvmdev.com',
    });
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

  getEmailService(): EmailService {
    return this.emailService;
  }

  getPasskeyService(): PasskeyService {
    return this.passkeyService;
  }

  getSessionService(): SessionService {
    return this.sessionService;
  }
}

