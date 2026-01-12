import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import * as crypto from 'crypto';

type SyncUsersResponse = {
  success: boolean;
  data?: {
    generated_at?: string;
    users: Array<{
      email: string;
      has_access: boolean;
      status?: string | null;
      end_date?: string | null;
      subscription_id?: number | null;
      plan_id?: number | null;
    }>;
  };
  error?: { message: string; code?: string };
};

@Processor('mvm-pay-sync')
export class MvmPaySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MvmPaySyncProcessor.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {
    super();
  }

  private sign(ts: string, body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
  }

  private normalizeBaseUrl(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  async process(_job: Job<any>): Promise<any> {
    const startedAt = Date.now();
    this.logger.log('Iniciando sync de usuários (MvM Pay)...');

    await this.prisma.mvmPayLog.create({
      data: {
        level: 'INFO',
        source: 'SYNC',
        action: 'sync_start',
      },
    }).catch(() => undefined);

    // Só roda se provider estiver em mvm_pay
    const providerSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'subscription_provider' },
    });
    const provider = providerSetting?.value || 'native';
    if (provider !== 'mvm_pay') {
      return { success: true, message: 'Provider não é mvm_pay (skip)', synced: 0, updated: 0 };
    }

    const cfg = await this.prisma.mvmPayConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });
    if (!cfg) {
      return { success: false, message: 'Configuração do MvM Pay não encontrada/ativa', synced: 0, updated: 0 };
    }

    const secret = await this.encryptionService.decrypt(cfg.api_secret_enc);
    const ts = Math.floor(Date.now() / 1000).toString();
    const bodyObj = { product_id: cfg.product_id };
    const body = JSON.stringify(bodyObj);
    const sig = this.sign(ts, body, secret);

    const baseUrl = this.normalizeBaseUrl(cfg.base_url);
    const url = `${baseUrl}/sync/users`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.api_key,
        'X-API-Timestamp': ts,
        'X-API-Signature': sig,
      },
      body,
    });

    const json = (await res.json().catch(() => null)) as SyncUsersResponse | null;
    if (!res.ok || !json) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      this.logger.warn(`Falha no sync MvM Pay: ${msg}`);
      await this.prisma.mvmPayLog.create({
        data: {
          level: 'WARN',
          source: 'SYNC',
          action: 'sync_end',
          status_code: res.status,
          duration_ms: Date.now() - startedAt,
          error_message: msg,
          response_json: json as any,
        },
      }).catch(() => undefined);
      return { success: false, message: msg, synced: 0, updated: 0 };
    }
    if (!json.success) {
      await this.prisma.mvmPayLog.create({
        data: {
          level: 'WARN',
          source: 'SYNC',
          action: 'sync_end',
          status_code: res.status,
          duration_ms: Date.now() - startedAt,
          error_message: json?.error?.message || 'Erro do MvM Pay',
          response_json: json as any,
        },
      }).catch(() => undefined);
      return { success: false, message: json?.error?.message || 'Erro do MvM Pay', synced: 0, updated: 0 };
    }

    const users = json.data?.users || [];
    let synced = 0;
    let updated = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const u of users) {
      try {
        synced++;
        const email = String(u.email || '').trim().toLowerCase();
        if (!email) continue;

        // mapear plano do MvM Pay -> plano local (quando houver)
        const localPlan = u.plan_id
          ? await this.prisma.subscriptionPlan.findFirst({
              where: {
                OR: [
                  { mvm_pay_plan_id_monthly: u.plan_id },
                  { mvm_pay_plan_id_quarterly: u.plan_id },
                ],
              },
            })
          : null;

        // Upsert user (sem password final — usuário define no /subscribe/register)
        const user = await this.prisma.user.upsert({
          where: { email },
          create: {
            email,
            password_hash: crypto.randomBytes(24).toString('hex'),
            is_active: true,
            must_change_password: true,
          },
          update: {
            is_active: true,
          },
        });

        // garantir role subscriber se existe algum registro no sync (acesso ou não)
        await this.prisma.userRole.upsert({
          where: { user_id_role: { user_id: user.id, role: 'subscriber' } },
          create: { user_id: user.id, role: 'subscriber' },
          update: {},
        });

        // Atualizar/registrar assinatura local
        const existing = await this.prisma.subscription.findFirst({
          where: { user_id: user.id },
          orderBy: { created_at: 'desc' },
        });

        const now = new Date();
        const endDate = u.end_date ? new Date(u.end_date) : now;
        const status = u.has_access ? 'ACTIVE' : 'EXPIRED';

        if (localPlan) {
          if (existing) {
            await this.prisma.subscription.update({
              where: { id: existing.id },
              data: {
                plan_id: localPlan.id,
                status,
                start_date: existing.start_date || now,
                end_date: endDate,
                auto_renew: false,
                payment_method: 'MVM_PAY',
                origin_provider: 'mvm_pay',
                external_subscription_id: u.subscription_id ? String(u.subscription_id) : undefined,
              },
            });
          } else {
            await this.prisma.subscription.create({
              data: {
                user_id: user.id,
                plan_id: localPlan.id,
                status,
                start_date: now,
                end_date: endDate,
                auto_renew: false,
                payment_method: 'MVM_PAY',
                origin_provider: 'mvm_pay',
                external_subscription_id: u.subscription_id ? String(u.subscription_id) : null,
              },
            });
          }
        } else {
          // Sem mapeamento, não conseguimos gravar Subscription (plan_id é obrigatório).
          // Mantemos pelo menos o user/role para visibilidade no admin.
          if (u.plan_id) {
            this.logger.warn(`Plano MvM Pay sem mapeamento local (plan_id=${u.plan_id}) para ${email}`);
          }
        }

        updated++;
      } catch (e: any) {
        errors.push({ email: u.email, error: e?.message || 'Erro desconhecido' });
      }
    }

    const duration = Date.now() - startedAt;
    await this.prisma.mvmPayLog.create({
      data: {
        level: errors.length ? 'WARN' : 'INFO',
        source: 'SYNC',
        action: 'sync_end',
        status_code: 200,
        duration_ms: duration,
        response_json: {
          synced,
          updated,
          errors: errors.length,
          error_details: errors.length ? errors.slice(0, 50) : undefined,
        } as any,
      },
    }).catch(() => undefined);
    return {
      success: true,
      message: 'Sync concluído',
      synced,
      updated,
      errors: errors.length,
      error_details: errors.length ? errors : undefined,
      duration_ms: duration,
    };
  }
}

