import { apiClient } from './client';

export interface SubscriptionPlan {
  id: number;
  name: string;
  description?: string;
  price_monthly: number;
  price_quarterly: number;
  duration_days: number;
  is_active: boolean;
  features_json?: any;
  max_exchange_accounts?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: number;
  user_id: number;
  plan_id: number;
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PENDING_PAYMENT';
  start_date?: string;
  end_date?: string;
  auto_renew: boolean;
  payment_method?: 'CARD' | 'PIX';
  mp_payment_id?: string;
  mp_preference_id?: string;
  created_at: string;
  updated_at: string;
  plan: SubscriptionPlan;
  payments?: SubscriptionPayment[];
}

export interface SubscriptionPayment {
  id: number;
  subscription_id: number;
  mp_payment_id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED';
  payment_method?: 'CARD' | 'PIX';
  created_at: string;
}

export interface CheckoutSubscriptionDto {
  plan_id: number;
  billing_period: 'monthly' | 'quarterly';
  full_name: string;
  cpf: string;
  birth_date: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  address_street: string;
  address_number: string;
  address_complement?: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zipcode: string;
}

export interface CheckoutResponse {
  // native
  preference_id?: string;
  init_point?: string;
  subscription_id?: number;
  // mvm_pay
  provider?: 'mvm_pay';
  checkout_url?: string;
  state?: string;
}

export interface RegistrationTokenInfo {
  email: string;
  expires_at: string;
}

export const subscriptionsService = {
  getPlans: async (): Promise<SubscriptionPlan[]> => {
    const response = await apiClient.get<SubscriptionPlan[]>('/subscriptions/plans');
    return response.data;
  },

  createCheckout: async (data: CheckoutSubscriptionDto): Promise<CheckoutResponse> => {
    const response = await apiClient.post<CheckoutResponse>('/subscriptions/checkout', data);
    return response.data;
  },

  getMySubscription: async (): Promise<Subscription | null> => {
    try {
      const response = await apiClient.get<Subscription>('/subscriptions/my-subscription');
      return response.data || null;
    } catch (error: any) {
      // Se der 404 ou qualquer erro, retornar null para permitir acesso à página
      if (error?.response?.status === 404) {
        return null;
      }
      // Para outros erros, também retornar null para não bloquear acesso
      console.error('Erro ao buscar assinatura:', error);
      return null;
    }
  },

  getMyPlan: async (): Promise<any> => {
    try {
      const response = await apiClient.get('/subscriptions/my-plan');
      return response.data || null;
    } catch (error: any) {
      // Se der erro, retornar null para permitir acesso à página
      console.error('Erro ao buscar plano:', error);
      return null;
    }
  },

  cancelSubscription: async (): Promise<Subscription> => {
    const response = await apiClient.post<Subscription>('/subscriptions/cancel');
    return response.data;
  },

  renewSubscription: async (billingPeriod: 'monthly' | 'quarterly'): Promise<CheckoutResponse> => {
    const response = await apiClient.post<CheckoutResponse>('/subscriptions/renew', {
      billing_period: billingPeriod,
    });
    return response.data;
  },

  getRegistrationTokenInfo: async (token: string): Promise<RegistrationTokenInfo> => {
    const response = await apiClient.get('/subscriptions/register/token-info', {
      params: { token },
    });
    return response.data;
  },

  completeRegistration: async (data: {
    token?: string;
    password: string;
    // nativo (sem token)
    email?: string;
    // dados de perfil (MvM Pay)
    full_name?: string;
    phone?: string;
    whatsapp_phone?: string;
  }): Promise<any> => {
    const response = await apiClient.post('/subscriptions/register', data);
    return response.data;
  },

  startMvmPayActivation: async (email: string): Promise<{ success: boolean; message: string; expires_at: string }> => {
    const response = await apiClient.post('/subscriptions/mvm-pay/activate', { email });
    return response.data;
  },
};
