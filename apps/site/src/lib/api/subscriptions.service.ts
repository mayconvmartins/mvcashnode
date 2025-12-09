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
    try {
      const response = await apiClient.get('/subscriptions/plans');
      // Garantir que retorna um array
      if (Array.isArray(response.data)) {
        return response.data;
      }
      // Se não for array, retornar array vazio
      console.warn('API retornou dados que não são um array:', response.data);
      return [];
    } catch (error) {
      console.error('Erro ao buscar planos:', error);
      return [];
    }
  },
};

