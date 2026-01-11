import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { PrismaClient } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
  rememberMe?: boolean;
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
    const hash = await bcrypt.hash(password, saltRounds);
    return hash;
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  }

  generateJWT(payload: JwtPayload, rememberMe: boolean = false): string {
    const expiresIn = rememberMe 
      ? 7 * 24 * 60 * 60  // 7 dias se lembrar de mim
      : this.jwtExpiresIn;  // 1 hora (padrão atual)
      
    return jwt.sign(
      { ...payload, rememberMe },  // Incluir flag no payload
      this.jwtSecret,
      { expiresIn }
    );
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

    if (!user) {
      await this.logLoginAttempt(credentials.email, false, ip, userAgent);
      throw new Error('Invalid credentials');
    }

    if (!user.is_active) {
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

    const accessToken = this.generateJWT(payload, credentials.rememberMe || false);
    const refreshToken = this.generateRefreshToken(payload);

    const expiresIn = credentials.rememberMe
      ? 7 * 24 * 60 * 60  // 7 dias
      : this.jwtExpiresIn; // 1 hora

    return {
      requires2FA: false,
      accessToken,
      refreshToken,
      expiresIn,
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

    // Preservar o rememberMe do token antigo se existir
    const oldPayload = payload as any;
    const rememberMe = oldPayload.rememberMe || false;

    return {
      accessToken: this.generateJWT(newPayload, rememberMe),
      refreshToken: this.generateRefreshToken(newPayload),
    };
  }

  /**
   * Gera um token de impersonation para um admin logar como outro usuário
   * O token tem validade de 1 hora e inclui informação de quem está impersonando
   */
  generateImpersonationToken(
    targetUserId: number,
    targetEmail: string,
    targetRoles: string[],
    adminUserId: number
  ): string {
    const payload = {
      userId: targetUserId,
      email: targetEmail,
      roles: targetRoles,
      impersonatedBy: adminUserId,
      isImpersonation: true,
    };

    // Token de impersonation tem validade de 1 hora
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: 3600,
    });
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

  async changePasswordRequired(
    email: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!email || !currentPassword || !newPassword) {
      const missing = [];
      if (!email) missing.push('email');
      if (!currentPassword) missing.push('currentPassword');
      if (!newPassword) missing.push('newPassword');
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.is_active) {
      throw new Error('Invalid credentials');
    }

    if (!user.must_change_password) {
      throw new Error('Password change is not required for this user');
    }

    const isValidPassword = await this.verifyPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const newPasswordHash = await this.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: newPasswordHash,
        must_change_password: false,
      },
    });
  }

  /**
   * Gera token de reset de senha
   */
  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.is_active) {
      // Não revelar se o usuário existe ou não por segurança
      return '';
    }

    // Gerar token único
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    // Expira em 1 hora
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Invalidar tokens anteriores não usados
    await this.prisma.passwordResetToken.updateMany({
      where: {
        user_id: user.id,
        used_at: null,
      },
      data: {
        used_at: new Date(),
      },
    });

    // Criar novo token
    await this.prisma.passwordResetToken.create({
      data: {
        user_id: user.id,
        token,
        expires_at: expiresAt,
      },
    });

    return token;
  }

  /**
   * Valida token de reset de senha
   */
  async validatePasswordResetToken(token: string): Promise<number | null> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return null;
    }

    // Verificar se já foi usado
    if (resetToken.used_at) {
      return null;
    }

    // Verificar se expirou
    if (new Date() > resetToken.expires_at) {
      return null;
    }

    return resetToken.user_id;
  }

  /**
   * Reseta senha usando token
   * Retorna o email do usuário para envio de confirmação
   */
  async resetPassword(token: string, newPassword: string): Promise<string | null> {
    if (!token || !newPassword) {
      const missing = [];
      if (!token) missing.push('token');
      if (!newPassword) missing.push('newPassword');
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const userId = await this.validatePasswordResetToken(token);

    if (!userId) {
      throw new Error('Invalid or expired token');
    }

    // Buscar email antes de atualizar
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const newPasswordHash = await this.hashPassword(newPassword);

    // Atualizar senha
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
      },
    });

    // Marcar token como usado
    await this.prisma.passwordResetToken.update({
      where: { token },
      data: {
        used_at: new Date(),
      },
    });

    return user?.email || null;
  }
}

