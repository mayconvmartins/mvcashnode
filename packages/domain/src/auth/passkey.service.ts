import { PrismaService } from '@mvcashnode/db';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';

export interface PasskeyRegistrationOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout: number;
  attestation: 'none' | 'indirect' | 'direct' | 'enterprise';
  excludeCredentials: Array<{
    id: string;
    type: 'public-key';
    transports?: AuthenticatorTransportFuture[];
  }>;
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    requireResidentKey: boolean;
    residentKey: 'discouraged' | 'preferred' | 'required';
    userVerification: 'required' | 'preferred' | 'discouraged';
  };
}

export interface PasskeyAuthenticationOptions {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: Array<{
    id: string;
    type: 'public-key';
    transports?: AuthenticatorTransportFuture[];
  }>;
  userVerification: 'required' | 'preferred' | 'discouraged';
}

export interface PasskeyInfo {
  id: number;
  deviceName: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  transports: string | null;
}

// Tempo de expiração do challenge: 5 minutos
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000;

export class PasskeyService {
  private prisma: PrismaService;
  private rpName: string;
  private rpID: string;
  private origin: string;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
    // Configurações do Relying Party - devem ser configuradas via env
    this.rpName = process.env.PASSKEY_RP_NAME || 'MVCash Trading';
    this.rpID = process.env.PASSKEY_RP_ID || 'app.mvcash.com.br';
    this.origin = process.env.PASSKEY_ORIGIN || 'https://app.mvcash.com.br';
  }

  /**
   * Armazena um challenge no banco de dados
   */
  private async storeChallenge(key: string, challenge: string): Promise<void> {
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);
    
    // Usar upsert para atualizar se já existir
    await this.prisma.passkeyChallenge.upsert({
      where: { challenge_key: key },
      update: {
        challenge,
        expires_at: expiresAt,
      },
      create: {
        challenge_key: key,
        challenge,
        expires_at: expiresAt,
      },
    });

    console.log(`[PASSKEY] Challenge armazenado: ${key}`);
  }

  /**
   * Recupera e remove um challenge do banco de dados
   */
  private async getAndDeleteChallenge(key: string): Promise<string | null> {
    const record = await this.prisma.passkeyChallenge.findUnique({
      where: { challenge_key: key },
    });

    if (!record) {
      console.log(`[PASSKEY] Challenge não encontrado: ${key}`);
      return null;
    }

    // Verificar expiração
    if (new Date() > record.expires_at) {
      console.log(`[PASSKEY] Challenge expirado: ${key}`);
      // Limpar o challenge expirado
      await this.prisma.passkeyChallenge.delete({
        where: { challenge_key: key },
      }).catch(() => {}); // Ignorar erro se já foi deletado
      return null;
    }

    // Deletar o challenge usado
    await this.prisma.passkeyChallenge.delete({
      where: { challenge_key: key },
    }).catch(() => {}); // Ignorar erro se já foi deletado

    console.log(`[PASSKEY] Challenge recuperado e removido: ${key}`);
    return record.challenge;
  }

  /**
   * Limpa challenges expirados (pode ser chamado periodicamente)
   */
  async cleanupExpiredChallenges(): Promise<number> {
    const result = await this.prisma.passkeyChallenge.deleteMany({
      where: {
        expires_at: {
          lt: new Date(),
        },
      },
    });
    
    if (result.count > 0) {
      console.log(`[PASSKEY] ${result.count} challenges expirados removidos`);
    }
    
    return result.count;
  }

  /**
   * Gera opções para iniciar o registro de uma nova passkey
   */
  async generateRegistrationOptions(
    userId: number,
    _userAgent?: string
  ): Promise<PasskeyRegistrationOptions> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        profile: true,
        passkeys: true,
      },
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Buscar passkeys existentes para excluir na criação
    const existingCredentials = user.passkeys.map((passkey) => ({
      id: passkey.credential_id,
      type: 'public-key' as const,
      transports: passkey.transports?.split(',') as AuthenticatorTransportFuture[] | undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new TextEncoder().encode(userId.toString()),
      userName: user.email,
      userDisplayName: user.profile?.full_name || user.email,
      timeout: 60000, // 60 segundos
      attestationType: 'none',
      excludeCredentials: existingCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', // Preferir autenticadores de plataforma (biometria)
      },
      supportedAlgorithmIDs: [-7, -257], // ES256, RS256
    });

    // Armazenar o challenge no banco de dados
    const challengeKey = `reg_${userId}`;
    await this.storeChallenge(challengeKey, options.challenge);

    return options as unknown as PasskeyRegistrationOptions;
  }

  /**
   * Verifica e registra uma nova passkey
   */
  async verifyRegistration(
    userId: number,
    response: RegistrationResponseJSON,
    deviceName?: string,
    userAgent?: string
  ): Promise<PasskeyInfo> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // Recuperar o challenge do banco de dados
    const challengeKey = `reg_${userId}`;
    const expectedChallenge = await this.getAndDeleteChallenge(challengeKey);
    
    if (!expectedChallenge) {
      throw new Error('Challenge não encontrado ou expirado. Tente novamente.');
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });
    } catch (error: any) {
      console.error('[PASSKEY] Erro na verificação de registro:', error.message);
      throw new Error('Falha na verificação da passkey. Verifique se está no dispositivo correto.');
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Verificação de passkey falhou');
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    // Gerar nome do dispositivo automaticamente se não fornecido
    const autoDeviceName = deviceName || this.parseDeviceName(userAgent);

    // Salvar a passkey no banco
    const passkey = await this.prisma.passkey.create({
      data: {
        user_id: userId,
        credential_id: credentialID,
        public_key: Buffer.from(credentialPublicKey).toString('base64'),
        counter: BigInt(counter),
        device_name: autoDeviceName,
        transports: response.response.transports?.join(',') || null,
        user_agent: userAgent,
      },
    });

    console.log(`[PASSKEY] Nova passkey registrada para usuário ${userId}: ${passkey.id}`);

    return {
      id: passkey.id,
      deviceName: passkey.device_name,
      createdAt: passkey.created_at,
      lastUsedAt: passkey.last_used_at,
      transports: passkey.transports,
    };
  }

  /**
   * Gera opções para iniciar a autenticação com passkey
   */
  async generateAuthenticationOptions(
    email?: string
  ): Promise<PasskeyAuthenticationOptions & { userId?: number }> {
    let allowCredentials: Array<{
      id: string;
      type: 'public-key';
      transports?: AuthenticatorTransportFuture[];
    }> = [];
    let userId: number | undefined;

    // Se email fornecido, buscar passkeys do usuário
    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: { passkeys: true },
      });

      if (user && user.passkeys.length > 0) {
        userId = user.id;
        allowCredentials = user.passkeys.map((passkey) => ({
          id: passkey.credential_id,
          type: 'public-key' as const,
          transports: passkey.transports?.split(',') as AuthenticatorTransportFuture[] | undefined,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      timeout: 60000,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Armazenar challenge no banco - usar email como chave se disponível
    const challengeKey = email ? `auth_${email}` : `auth_${options.challenge}`;
    await this.storeChallenge(challengeKey, options.challenge);

    return {
      ...options,
      userId,
    } as PasskeyAuthenticationOptions & { userId?: number };
  }

  /**
   * Verifica a autenticação com passkey e retorna o usuário
   */
  async verifyAuthentication(
    response: AuthenticationResponseJSON,
    email?: string
  ): Promise<{
    userId: number;
    email: string;
    roles: string[];
    passkeyId: number;
  }> {
    // Buscar a passkey pelo credential ID
    const passkey = await this.prisma.passkey.findUnique({
      where: { credential_id: response.id },
      include: {
        user: {
          include: { roles: true },
        },
      },
    });

    if (!passkey) {
      throw new Error('Passkey não encontrada');
    }

    if (!passkey.user.is_active) {
      throw new Error('Usuário inativo');
    }

    // Recuperar challenge - tentar com email primeiro, depois com challenge do response
    let expectedChallenge: string | null = null;
    
    if (email) {
      expectedChallenge = await this.getAndDeleteChallenge(`auth_${email}`);
    }
    
    if (!expectedChallenge) {
      // Tentar buscar qualquer challenge de autenticação recente
      // Isso é necessário para Conditional UI onde não temos o email
      const recentChallenges = await this.prisma.passkeyChallenge.findMany({
        where: {
          challenge_key: { startsWith: 'auth_' },
          expires_at: { gt: new Date() },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
      });

      for (const ch of recentChallenges) {
        expectedChallenge = ch.challenge;
        // Deletar o challenge usado
        await this.prisma.passkeyChallenge.delete({
          where: { id: ch.id },
        }).catch(() => {});
        break;
      }
    }

    if (!expectedChallenge) {
      throw new Error('Challenge não encontrado ou expirado. Tente novamente.');
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
        authenticator: {
          credentialID: passkey.credential_id,
          credentialPublicKey: Buffer.from(passkey.public_key, 'base64'),
          counter: Number(passkey.counter),
        },
      });
    } catch (error: any) {
      console.error('[PASSKEY] Erro na verificação de autenticação:', error.message);
      throw new Error('Falha na autenticação. Verifique sua biometria ou PIN.');
    }

    if (!verification.verified) {
      throw new Error('Verificação de passkey falhou');
    }

    // Atualizar counter e última utilização
    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        last_used_at: new Date(),
      },
    });

    console.log(`[PASSKEY] Autenticação bem-sucedida para usuário ${passkey.user_id}`);

    return {
      userId: passkey.user.id,
      email: passkey.user.email,
      roles: passkey.user.roles.map((r) => r.role),
      passkeyId: passkey.id,
    };
  }

  /**
   * Lista todas as passkeys de um usuário
   */
  async listPasskeys(userId: number): Promise<PasskeyInfo[]> {
    const passkeys = await this.prisma.passkey.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });

    return passkeys.map((p) => ({
      id: p.id,
      deviceName: p.device_name,
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at,
      transports: p.transports,
    }));
  }

  /**
   * Remove uma passkey
   */
  async deletePasskey(userId: number, passkeyId: number): Promise<void> {
    const passkey = await this.prisma.passkey.findFirst({
      where: {
        id: passkeyId,
        user_id: userId,
      },
    });

    if (!passkey) {
      throw new Error('Passkey não encontrada');
    }

    // Verificar se é a última passkey - permitir remoção mesmo assim
    // pois o usuário ainda pode usar senha
    await this.prisma.passkey.delete({
      where: { id: passkeyId },
    });

    console.log(`[PASSKEY] Passkey ${passkeyId} removida do usuário ${userId}`);
  }

  /**
   * Verifica se o usuário tem passkeys cadastradas
   */
  async hasPasskeys(userId: number): Promise<boolean> {
    const count = await this.prisma.passkey.count({
      where: { user_id: userId },
    });
    return count > 0;
  }

  /**
   * Verifica se o email tem passkeys cadastradas (para tela de login)
   */
  async emailHasPasskeys(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { _count: { select: { passkeys: true } } },
    });
    return (user?._count?.passkeys || 0) > 0;
  }

  /**
   * Atualiza o nome de um dispositivo/passkey
   */
  async updatePasskeyName(userId: number, passkeyId: number, deviceName: string): Promise<PasskeyInfo> {
    const passkey = await this.prisma.passkey.findFirst({
      where: {
        id: passkeyId,
        user_id: userId,
      },
    });

    if (!passkey) {
      throw new Error('Passkey não encontrada');
    }

    const updated = await this.prisma.passkey.update({
      where: { id: passkeyId },
      data: { device_name: deviceName },
    });

    return {
      id: updated.id,
      deviceName: updated.device_name,
      createdAt: updated.created_at,
      lastUsedAt: updated.last_used_at,
      transports: updated.transports,
    };
  }

  /**
   * Tenta extrair o nome do dispositivo do user agent
   */
  private parseDeviceName(userAgent?: string): string {
    if (!userAgent) return 'Dispositivo desconhecido';

    // Detectar dispositivo iOS
    if (/iPhone/.test(userAgent)) {
      const match = userAgent.match(/iPhone OS (\d+)/);
      return match ? `iPhone (iOS ${match[1]})` : 'iPhone';
    }
    if (/iPad/.test(userAgent)) {
      return 'iPad';
    }

    // Detectar Mac
    if (/Macintosh/.test(userAgent)) {
      return 'Mac';
    }

    // Detectar Android
    if (/Android/.test(userAgent)) {
      const match = userAgent.match(/Android (\d+)/);
      return match ? `Android ${match[1]}` : 'Android';
    }

    // Detectar Windows
    if (/Windows/.test(userAgent)) {
      if (/Windows NT 10/.test(userAgent)) return 'Windows 10/11';
      return 'Windows';
    }

    // Detectar Linux
    if (/Linux/.test(userAgent)) {
      return 'Linux';
    }

    return 'Dispositivo';
  }
}
