import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuditService {
  constructor(private authService: AuthService) {}

  getDomainAuditService() {
    return this.authService.getDomainAuditService();
  }
}

