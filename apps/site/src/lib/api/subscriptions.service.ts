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
      
      // NestJS pode retornar diretamente um array ou envolver em {data: [...]}
      // Axios também pode envolver em response.data
      let plans: SubscriptionPlan[] = [];
      
      if (Array.isArray(response.data)) {
        // Se response.data é diretamente um array
        plans = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        // Se response.data tem uma propriedade 'data' que é um array
        plans = response.data.data;
      } else if (response.data && typeof response.data === 'object') {
        // Tentar extrair array de qualquer propriedade do objeto
        const keys = Object.keys(response.data);
        for (const key of keys) {
          if (Array.isArray(response.data[key])) {
            plans = response.data[key];
            break;
          }
        }
      }
      
      // Garantir que retorna um array válido
      if (!Array.isArray(plans) || plans.length === 0) {
        console.warn('API retornou dados que não são um array válido:', response.data);
        return [];
      }
      
      return plans;
    } catch (error) {
      console.error('Erro ao buscar planos:', error);
      return [];
    }
  },
};

