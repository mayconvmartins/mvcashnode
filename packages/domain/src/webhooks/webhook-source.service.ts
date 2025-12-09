import { PrismaClient } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { isIPInList } from '@mvcashnode/shared';
import { createHmac } from 'crypto';
import { TradeMode } from '@mvcashnode/shared';

export interface CreateWebhookSourceDto {
  ownerUserId: number;
  label: string;
  webhookCode: string;
  tradeMode: TradeMode;
  allowedIPs?: string[];
  requireSignature?: boolean;
  signingSecret?: string;
  rateLimitPerMin?: number;
  isShared?: boolean;
  monitorEnabled?: boolean;
}

export class WebhookSourceService {
  constructor(
    private prisma: PrismaClient,
    private encryptionService: EncryptionService
  ) {}

  async createSource(dto: CreateWebhookSourceDto): Promise<any> {
    let signingSecretEnc: string | null = null;
    if (dto.requireSignature && dto.signingSecret) {
      signingSecretEnc = await this.encryptionService.encrypt(dto.signingSecret);
    }

    return this.prisma.webhookSource.create({
      data: {
        owner_user_id: dto.ownerUserId,
        label: dto.label,
        webhook_code: dto.webhookCode,
        trade_mode: dto.tradeMode,
        allowed_ips_json: dto.allowedIPs ? JSON.parse(JSON.stringify(dto.allowedIPs)) : null,
        require_signature: dto.requireSignature || false,
        signing_secret_enc: signingSecretEnc,
        rate_limit_per_min: dto.rateLimitPerMin || 60,
        is_shared: dto.isShared || false,
        monitor_enabled: dto.monitorEnabled || false,
      },
    });
  }

  async getSourceByCode(webhookCode: string): Promise<any> {
    return this.prisma.webhookSource.findUnique({
      where: { webhook_code: webhookCode },
      include: {
        bindings: {
          include: {
            exchange_account: true,
          },
        },
      },
    });
  }

  async validateIP(webhookCode: string, ip: string): Promise<boolean> {
    const source = await this.getSourceByCode(webhookCode);
    if (!source) {
      return false;
    }

    // Se não há restrições de IP, permite todos
    if (!source.allowed_ips_json || (source.allowed_ips_json as string[]).length === 0) {
      return true; // No restrictions
    }

    const allowedIPs = source.allowed_ips_json as string[];
    
    // Se contém "0.0.0.0/0", permite todos os IPs
    if (allowedIPs.includes('0.0.0.0/0')) {
      return true;
    }

    return isIPInList(ip, allowedIPs);
  }

  async validateSignature(webhookCode: string, body: string, signature: string): Promise<boolean> {
    const source = await this.getSourceByCode(webhookCode);
    if (!source || !source.require_signature || !source.signing_secret_enc) {
      return true; // No signature required
    }

    const secret = await this.encryptionService.decrypt(source.signing_secret_enc);
    const expectedSignature = createHmac('sha256', secret).update(body).digest('hex');
    const providedSignature = signature.replace('sha256=', '');

    return expectedSignature === providedSignature;
  }

  async checkRateLimit(webhookCode: string): Promise<boolean> {
    const source = await this.getSourceByCode(webhookCode);
    if (!source) {
      return false;
    }

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentEvents = await this.prisma.webhookEvent.count({
      where: {
        webhook_source_id: source.id,
        created_at: { gte: oneMinuteAgo },
      },
    });

    return recentEvents < source.rate_limit_per_min;
  }
}

