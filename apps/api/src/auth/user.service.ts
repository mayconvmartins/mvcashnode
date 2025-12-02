import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class UserService {
  constructor(private authService: AuthService) {}

  getDomainUserService() {
    return this.authService.getDomainUserService();
  }
}

