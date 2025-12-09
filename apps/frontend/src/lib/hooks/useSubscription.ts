import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionsService } from '../api/subscriptions.service';
import { toast } from 'sonner';

export function useSubscription() {
  const queryClient = useQueryClient();

  const subscriptionQuery = useQuery({
    queryKey: ['subscription', 'my-subscription'],
    queryFn: () => subscriptionsService.getMySubscription(),
    retry: false,
    enabled: true, // Habilitado para buscar automaticamente
  });

  const planQuery = useQuery({
    queryKey: ['subscription', 'my-plan'],
    queryFn: () => subscriptionsService.getMyPlan(),
    retry: false,
    enabled: true, // Habilitado para buscar automaticamente
  });

  const cancelMutation = useMutation({
    mutationFn: () => subscriptionsService.cancelSubscription(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      toast.success('Assinatura cancelada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao cancelar assinatura');
    },
  });

  const renewMutation = useMutation({
    mutationFn: (billingPeriod: 'monthly' | 'quarterly') =>
      subscriptionsService.renewSubscription(billingPeriod),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      toast.success('Renovação iniciada. Redirecionando para pagamento...');
      // Redirecionar para página de pagamento
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao renovar assinatura');
    },
  });

  return {
    subscription: subscriptionQuery.data,
    plan: planQuery.data,
    isLoading: subscriptionQuery.isLoading || planQuery.isLoading,
    isError: subscriptionQuery.isError || planQuery.isError,
    refetch: () => {
      subscriptionQuery.refetch();
      planQuery.refetch();
    },
    cancel: cancelMutation.mutate,
    renew: renewMutation.mutate,
    isCancelling: cancelMutation.isPending,
    isRenewing: renewMutation.isPending,
  };
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription', 'plans'],
    queryFn: () => subscriptionsService.getPlans(),
  });
}
