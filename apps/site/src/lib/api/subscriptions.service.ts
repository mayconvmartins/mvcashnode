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
}

export const subscriptionsService = {
  async getPlans(): Promise<SubscriptionPlan[]> {
    const response = await apiClient.get('/subscriptions/plans');
    return response.data;
  },
};

