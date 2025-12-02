import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { PrismaClient } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface LoginResult {
  requires2FA: boolean;
  sessionToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: {
    id: number;
    email: string;
    fullName?: string;
    roles: string[];
  };
}

export interface JwtPayload {
  userId: number;
  email: string;
  roles: string[];
}

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private encryptionService: EncryptionService,
    private jwtSecret: string,
    private jwtRefreshSecret: string,
    private jwtExpiresIn: number = 3600,
    private jwtRefreshExpiresIn: number = 604800
  ) {}

  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateJWT(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  verifyJWT(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  generateRefreshToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.jwtRefreshExpiresIn,
    });
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtRefreshSecret) as JwtPayload;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  async setup2FA(userId: number): Promise<{ secret: string; qrCode: string; qrCodeUrl: string; backupCodes: string[] }> {
    const secret = authenticator.generateSecret();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      throw new Error('User not found');
    }

    const encryptedSecret = await this.encryptionService.encrypt(secret);

    await this.prisma.profile.update({
      where: { user_id: userId },
      data: {
        twofa_secret: encryptedSecret,
        twofa_enabled: false, // Will be enabled after verification
      },
    });

    const serviceName = 'Trading Automation';
    const accountName = user.email;
    const otpauth = authenticator.keyuri(accountName, serviceName, secret);

    return {
      secret,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`,
      qrCode: otpauth, // String otpauth para gerar QR code no frontend
      backupCodes: [], // Códigos de backup podem ser gerados aqui se necessário
    };
  }

  async verify2FA(userId: number, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user?.profile?.twofa_secret) {
      throw new Error('2FA not set up');
    }

    const decryptedSecret = await this.encryptionService.decrypt(user.profile.twofa_secret);
    const isValid = authenticator.verify({ token, secret: decryptedSecret });

    if (isValid && !user.profile.twofa_enabled) {
      // Enable 2FA after first successful verification
      await this.prisma.profile.update({
        where: { user_id: userId },
        data: { twofa_enabled: true },
      });
    }

    return isValid;
  }

  async login(
    credentials: LoginCredentials,
    ip?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: credentials.email },
      include: {
        profile: true,
        roles: true,
      },
    });

    if (!user || !user.is_active) {
      await this.logLoginAttempt(credentials.email, false, ip, userAgent);
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.verifyPassword(credentials.password, user.password_hash);

    if (!isValidPassword) {
      await this.logLoginAttempt(user.id, false, ip, userAgent);
      throw new Error('Invalid credentials');
    }

    // Check if 2FA is enabled
    if (user.profile?.twofa_enabled) {
      if (!credentials.twoFactorCode) {
        // Generate temporary session token for 2FA verification
        const sessionToken = this.generateJWT({
          userId: user.id,
          email: user.email,
          roles: user.roles.map((r: { role: string }) => r.role),
        });

        return {
          requires2FA: true,
          sessionToken,
        };
      }

      // Verify 2FA code
      const isValid2FA = await this.verify2FA(user.id, credentials.twoFactorCode);
      if (!isValid2FA) {
        await this.logLoginAttempt(user.id, false, ip, userAgent);
        throw new Error('Invalid 2FA code');
      }
    }

    // Check if password change is required
    if (user.must_change_password) {
      await this.logLoginAttempt(user.id, false, ip, userAgent);
      throw new Error('Password change required');
    }

    // Successful login
    await this.logLoginAttempt(user.id, true, ip, userAgent);

    const roles = user.roles.map((r: { role: string }) => r.role);
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      roles,
    };

    const accessToken = this.generateJWT(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      requires2FA: false,
      accessToken,
      refreshToken,
      expiresIn: this.jwtExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.profile?.full_name || undefined,
        roles,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.verifyRefreshToken(refreshToken);

    // Verify user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: { roles: true },
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    const newPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      roles: user.roles.map((r: { role: string }) => r.role),
    };

    return {
      accessToken: this.generateJWT(newPayload),
      refreshToken: this.generateRefreshToken(newPayload),
    };
  }

  private async logLoginAttempt(
    userIdOrEmail: number | string,
    success: boolean,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    if (typeof userIdOrEmail === 'string') {
      // Failed login with email only
      return;
    }

    await this.prisma.loginHistory.create({
      data: {
        user_id: userIdOrEmail,
        ip: ip || null,
        user_agent: userAgent || null,
        success,
      },
    });
  }
}

