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
  preference_id: string;
  init_point: string;
  subscription_id: number;
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

  getMySubscription: async (): Promise<Subscription> => {
    const response = await apiClient.get<Subscription>('/subscriptions/my-subscription');
    return response.data;
  },

  getMyPlan: async (): Promise<any> => {
    const response = await apiClient.get('/subscriptions/my-plan');
    return response.data;
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

  completeRegistration: async (token: string, password: string): Promise<any> => {
    const response = await apiClient.post('/subscriptions/register', {
      token,
      password,
    });
    return response.data;
  },
};
