import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import * as crypto from 'crypto';

export type MvmPayAccessResponse = {
  success: boolean;
  data?: {
    has_access: boolean;
    subscription: null | {
      id: number;
      status: string;
      end_date: string | null;
      days_remaining?: number;
      trial?: boolean;
      trial_ends_at?: string | null;
      plan_name?: string;
      plan_type?: string;
    };
  };
  error?: { message: string; code?: string };
};

export type MvmPayPlansResponse = {
  success: boolean;
  data?: {
    plans: Array<{
      id: number;
      name: string;
      type?: string;
      days?: number;
      product_id?: number;
    }>;
  };
  error?: { message: string; code?: string };
};

export type MvmPayUserSubscriptionsResponse = {
  success: boolean;
  data?: {
    subscriptions: Array<{
      id: number;
      user_email: string;
      status: string;
      start_date: string | null;
      end_date: string | null;
      plan_id: number;
      plan_name?: string;
      plan_type?: string;
      plan_days?: number;
      product_id?: number;
      product_name?: string;
      created_at?: string;
    }>;
  };
  error?: { message: string; code?: string };
};

export type MvmPaySyncUsersResponse = {
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

@Injectable()
export class MvmPayService {
  private readonly logger = new Logger(MvmPayService.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  async getActiveConfig(): Promise<{
    baseUrl: string;
    checkoutUrl: string;
    apiKey: string;
    apiSecret: string;
    productId: number;
  } | null> {
    const cfg = await this.prisma.mvmPayConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!cfg) return null;

    const apiSecret = await this.encryptionService.decrypt(cfg.api_secret_enc);
    return {
      baseUrl: cfg.base_url,
      checkoutUrl: cfg.checkout_url,
      apiKey: cfg.api_key,
      apiSecret,
      productId: cfg.product_id,
    };
  }

  private normalizeBaseUrl(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  private signRequest(ts: string, body: string, apiSecret: string): string {
    return crypto.createHmac('sha256', apiSecret).update(`${ts}:${body}`).digest('hex');
  }

  private async requestJson<T>(opts: {
    method: 'GET' | 'POST';
    path: string;
    query?: Record<string, string>;
    bodyObj?: any;
  }): Promise<T> {
    const cfg = await this.getActiveConfig();
    if (!cfg) {
      throw new BadRequestException('MvM Pay não está configurado/ativo');
    }

    const ts = Math.floor(Date.now() / 1000).toString();
    const body = opts.method === 'GET' ? '' : JSON.stringify(opts.bodyObj || {});
    const sig = this.signRequest(ts, body, cfg.apiSecret);

    const baseUrl = this.normalizeBaseUrl(cfg.baseUrl);
    const url = new URL(`${baseUrl}${opts.path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.apiKey,
        'X-API-Timestamp': ts,
        'X-API-Signature': sig,
      },
      ...(opts.method === 'GET' ? {} : { body }),
    });

    const json = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      this.logger.warn(`MvM Pay error (${res.status})`, { path: opts.path, body: opts.bodyObj });
      throw new BadRequestException('Erro ao comunicar com MvM Pay');
    }
    if (!json) throw new BadRequestException('Resposta inválida do MvM Pay');
    return json;
  }

  async authAccess(email: string): Promise<MvmPayAccessResponse> {
    const cfg = await this.getActiveConfig();
    if (!cfg) throw new BadRequestException('MvM Pay não está configurado/ativo');
    return this.requestJson<MvmPayAccessResponse>({
      method: 'GET',
      path: '/auth/access',
      query: { email, product_id: String(cfg.productId) },
    });
  }

  async getPlans(): Promise<MvmPayPlansResponse> {
    const cfg = await this.getActiveConfig();
    if (!cfg) throw new BadRequestException('MvM Pay não está configurado/ativo');
    return this.requestJson<MvmPayPlansResponse>({
      method: 'GET',
      path: '/plans',
      query: { product_id: String(cfg.productId) },
    });
  }

  async getUserSubscriptions(email: string): Promise<MvmPayUserSubscriptionsResponse> {
    return this.requestJson<MvmPayUserSubscriptionsResponse>({
      method: 'GET',
      path: `/users/${encodeURIComponent(email)}/subscriptions`,
    });
  }

  async syncUsers(): Promise<MvmPaySyncUsersResponse> {
    const cfg = await this.getActiveConfig();
    if (!cfg) throw new BadRequestException('MvM Pay não está configurado/ativo');
    return this.requestJson<MvmPaySyncUsersResponse>({
      method: 'POST',
      path: '/sync/users',
      bodyObj: { product_id: cfg.productId },
    });
  }

  buildSignedCheckoutUrl(params: {
    email: string;
    planId: number; // plan id do MvM Pay
    returnUrl: string;
    state: string;
  }): Promise<string> {
    return this.buildSignedCheckoutUrlWithConfig(params);
  }

  private async buildSignedCheckoutUrlWithConfig(params: {
    email: string;
    planId: number;
    returnUrl: string;
    state: string;
  }): Promise<string> {
    const cfg = await this.getActiveConfig();
    if (!cfg) {
      throw new BadRequestException('MvM Pay não está configurado/ativo');
    }

    const ts = Math.floor(Date.now() / 1000).toString();
    const dataToSign = `${ts}:${params.email}:${cfg.productId}:${params.planId}:${params.returnUrl}:${params.state}`;
    const sig = crypto.createHmac('sha256', cfg.apiSecret).update(dataToSign).digest('hex');

    const checkoutUrl = new URL(cfg.checkoutUrl);
    checkoutUrl.searchParams.set('email', params.email);
    checkoutUrl.searchParams.set('product_id', String(cfg.productId));
    checkoutUrl.searchParams.set('plan_id', String(params.planId));
    checkoutUrl.searchParams.set('return_url', params.returnUrl);
    checkoutUrl.searchParams.set('state', params.state);
    checkoutUrl.searchParams.set('ts', ts);
    checkoutUrl.searchParams.set('sig', sig);

    return checkoutUrl.toString();
  }
}

