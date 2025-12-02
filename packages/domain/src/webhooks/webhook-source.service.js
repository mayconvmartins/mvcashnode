"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookSourceService = void 0;
const shared_1 = require("@mvcashnode/shared");
const crypto_1 = require("crypto");
class WebhookSourceService {
    prisma;
    encryptionService;
    constructor(prisma, encryptionService) {
        this.prisma = prisma;
        this.encryptionService = encryptionService;
    }
    async createSource(dto) {
        let signingSecretEnc = null;
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
            },
        });
    }
    async getSourceByCode(webhookCode) {
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
    async validateIP(webhookCode, ip) {
        const source = await this.getSourceByCode(webhookCode);
        if (!source || !source.allowed_ips_json) {
            return true;
        }
        const allowedIPs = source.allowed_ips_json;
        return (0, shared_1.isIPInList)(ip, allowedIPs);
    }
    async validateSignature(webhookCode, body, signature) {
        const source = await this.getSourceByCode(webhookCode);
        if (!source || !source.require_signature || !source.signing_secret_enc) {
            return true;
        }
        const secret = await this.encryptionService.decrypt(source.signing_secret_enc);
        const expectedSignature = (0, crypto_1.createHmac)('sha256', secret).update(body).digest('hex');
        const providedSignature = signature.replace('sha256=', '');
        return expectedSignature === providedSignature;
    }
    async checkRateLimit(webhookCode) {
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
exports.WebhookSourceService = WebhookSourceService;
//# sourceMappingURL=webhook-source.service.js.map