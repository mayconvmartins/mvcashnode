import { PrismaService } from '@mvcashnode/db';
import * as crypto from 'crypto';

export interface SessionInfo {
  id: number;
  deviceName: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  isPasskeyAuth: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

export interface CreateSessionParams {
  userId: number;
  refreshToken: string;
  rememberMe: boolean;
  isPasskeyAuth?: boolean;
  userAgent?: string;
  ipAddress?: string;
}

export class SessionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cria uma nova sessão para o usuário
   */
  async createSession(params: CreateSessionParams): Promise<string> {
    const { userId, refreshToken, rememberMe, isPasskeyAuth, userAgent, ipAddress } = params;

    // Gerar token de sessão único
    const sessionToken = this.generateSessionToken();

    // Parsear user agent para extrair informações do dispositivo
    const deviceInfo = this.parseUserAgent(userAgent);

    // Calcular data de expiração
    const expiresAt = new Date();
    if (rememberMe) {
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 dias
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 dias
    }

    // Criar sessão
    await this.prisma.userSession.create({
      data: {
        user_id: userId,
        session_token: sessionToken,
        refresh_token: refreshToken,
        device_name: deviceInfo.deviceName,
        device_type: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        user_agent: userAgent || null,
        ip_address: ipAddress || null,
        remember_me: rememberMe,
        is_passkey_auth: isPasskeyAuth || false,
        expires_at: expiresAt,
      },
    });

    console.log(`[SESSION] Nova sessão criada para usuário ${userId}: ${sessionToken.substring(0, 10)}...`);

    return sessionToken;
  }

  /**
   * Atualiza a atividade da sessão e renova o refresh token
   */
  async refreshSession(oldRefreshToken: string, newRefreshToken: string): Promise<void> {
    const session = await this.prisma.userSession.findUnique({
      where: { refresh_token: oldRefreshToken },
    });

    if (!session) {
      throw new Error('Sessão não encontrada');
    }

    if (new Date() > session.expires_at) {
      // Sessão expirada, remover
      await this.prisma.userSession.delete({ where: { id: session.id } });
      throw new Error('Sessão expirada');
    }

    // Recalcular expiração se necessário
    const newExpiresAt = new Date();
    if (session.remember_me) {
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);
    } else {
      newExpiresAt.setDate(newExpiresAt.getDate() + 7);
    }

    // Atualizar sessão
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refresh_token: newRefreshToken,
        last_activity_at: new Date(),
        expires_at: newExpiresAt,
      },
    });
  }

  /**
   * Verifica se um refresh token pertence a uma sessão válida
   */
  async validateRefreshToken(refreshToken: string): Promise<{ userId: number; rememberMe: boolean } | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { refresh_token: refreshToken },
    });

    if (!session) {
      return null;
    }

    if (new Date() > session.expires_at) {
      // Sessão expirada, remover
      await this.prisma.userSession.delete({ where: { id: session.id } });
      return null;
    }

    return {
      userId: session.user_id,
      rememberMe: session.remember_me,
    };
  }

  /**
   * Lista todas as sessões ativas do usuário
   */
  async listSessions(userId: number, currentSessionToken?: string): Promise<SessionInfo[]> {
    // Primeiro, limpar sessões expiradas
    await this.cleanupExpiredSessions(userId);

    const sessions = await this.prisma.userSession.findMany({
      where: { user_id: userId },
      orderBy: { last_activity_at: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.device_name,
      deviceType: session.device_type,
      browser: session.browser,
      os: session.os,
      ipAddress: session.ip_address,
      isPasskeyAuth: session.is_passkey_auth,
      lastActivityAt: session.last_activity_at,
      createdAt: session.created_at,
      isCurrent: currentSessionToken === session.session_token,
    }));
  }

  /**
   * Encerra uma sessão específica
   */
  async terminateSession(userId: number, sessionId: number): Promise<void> {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        user_id: userId,
      },
    });

    if (!session) {
      throw new Error('Sessão não encontrada');
    }

    await this.prisma.userSession.delete({ where: { id: sessionId } });
    console.log(`[SESSION] Sessão ${sessionId} encerrada pelo usuário ${userId}`);
  }

  /**
   * Encerra todas as outras sessões exceto a atual
   */
  async terminateOtherSessions(userId: number, currentSessionToken: string): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: {
        user_id: userId,
        session_token: { not: currentSessionToken },
      },
    });

    console.log(`[SESSION] ${result.count} sessões encerradas para usuário ${userId}`);
    return result.count;
  }

  /**
   * Encerra todas as sessões do usuário (logout de todos os dispositivos)
   */
  async terminateAllSessions(userId: number): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: { user_id: userId },
    });

    console.log(`[SESSION] Todas ${result.count} sessões encerradas para usuário ${userId}`);
    return result.count;
  }

  /**
   * Limpa sessões expiradas
   */
  private async cleanupExpiredSessions(userId: number): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: {
        user_id: userId,
        expires_at: { lt: new Date() },
      },
    });
  }

  /**
   * Gera um token de sessão único
   */
  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Extrai informações do dispositivo do user agent
   */
  private parseUserAgent(userAgent?: string): {
    deviceName: string | null;
    deviceType: string | null;
    browser: string | null;
    os: string | null;
  } {
    if (!userAgent) {
      return {
        deviceName: null,
        deviceType: null,
        browser: null,
        os: null,
      };
    }

    let deviceName: string | null = null;
    let deviceType: string | null = 'desktop';
    let browser: string | null = null;
    let os: string | null = null;

    // Detectar SO
    if (/Windows NT 10/.test(userAgent)) {
      os = 'Windows 10/11';
    } else if (/Windows/.test(userAgent)) {
      os = 'Windows';
    } else if (/Mac OS X/.test(userAgent)) {
      os = 'macOS';
    } else if (/iPhone/.test(userAgent)) {
      os = 'iOS';
      deviceType = 'mobile';
    } else if (/iPad/.test(userAgent)) {
      os = 'iPadOS';
      deviceType = 'tablet';
    } else if (/Android/.test(userAgent)) {
      os = 'Android';
      deviceType = /Mobile/.test(userAgent) ? 'mobile' : 'tablet';
    } else if (/Linux/.test(userAgent)) {
      os = 'Linux';
    }

    // Detectar browser
    if (/Chrome\/\d+/.test(userAgent) && !/Edg\//.test(userAgent)) {
      const match = userAgent.match(/Chrome\/(\d+)/);
      browser = match ? `Chrome ${match[1]}` : 'Chrome';
    } else if (/Firefox\/\d+/.test(userAgent)) {
      const match = userAgent.match(/Firefox\/(\d+)/);
      browser = match ? `Firefox ${match[1]}` : 'Firefox';
    } else if (/Safari\/\d+/.test(userAgent) && !/Chrome/.test(userAgent)) {
      browser = 'Safari';
    } else if (/Edg\/\d+/.test(userAgent)) {
      const match = userAgent.match(/Edg\/(\d+)/);
      browser = match ? `Edge ${match[1]}` : 'Edge';
    }

    // Gerar nome do dispositivo
    if (os && browser) {
      deviceName = `${browser} em ${os}`;
    } else if (os) {
      deviceName = os;
    } else if (browser) {
      deviceName = browser;
    }

    return { deviceName, deviceType, browser, os };
  }
}

