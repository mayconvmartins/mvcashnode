'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Calendar, CreditCard, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

export default function SubscriptionDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const subscriptionId = parseInt(params.id as string);
  const [extendDays, setExtendDays] = useState(30);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', subscriptionId],
    queryFn: () => adminService.getSubscription(subscriptionId),
  });

  const { data: payments } = useQuery({
    queryKey: ['admin', 'subscriptions', subscriptionId, 'payments'],
    queryFn: () => adminService.getSubscriptionPayments(subscriptionId),
    enabled: !!subscription,
  });

  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: () => adminService.cancelSubscription(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      toast.success('Assinatura cancelada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao cancelar assinatura');
    },
  });

  const extendMutation = useMutation({
    mutationFn: (days: number) => adminService.extendSubscription(subscriptionId, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      toast.success('Validade estendida com sucesso');
      setExtendDays(30);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao estender validade');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => adminService.updateSubscription(subscriptionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      toast.success('Assinatura atualizada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao atualizar assinatura');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Assinatura não encontrada</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const statusColors: Record<string, "default" | "success" | "warning" | "outline" | "destructive" | "secondary"> = {
    ACTIVE: 'default',
    CANCELLED: 'secondary',
    EXPIRED: 'destructive',
    PENDING_PAYMENT: 'outline',
  };

  const isMvmPay = subscription.payment_method === 'MVM_PAY' || !!subscription.plan?.mvm_pay_plan_id;
  const paymentMethodLabel = (method?: string) => {
    if (!method) return 'N/A';
    if (method === 'MVM_PAY') return 'MvM Pay';
    if (method === 'CARD') return 'Cartão';
    if (method === 'PIX') return 'PIX';
    return method;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Detalhes da Assinatura</h1>
          <p className="text-muted-foreground">ID: {subscription.id}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Informações da Assinatura */}
        <Card>
          <CardHeader>
            <CardTitle>Informações da Assinatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fonte</span>
              {isMvmPay ? <Badge variant="secondary">MvM Pay</Badge> : <Badge variant="outline">Nativo</Badge>}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={statusColors[subscription.status] || 'outline'}>
                {subscription.status}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plano</span>
              <span className="font-medium">{subscription.plan?.name}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Usuário</span>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="font-medium">{subscription.user?.email}</span>
              </div>
            </div>

            {subscription.start_date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Data de Início</span>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {format(new Date(subscription.start_date), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </div>
            )}

            {subscription.end_date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Data de Término</span>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {format(new Date(subscription.end_date), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </div>
            )}

            {subscription.payment_method && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Método de Pagamento</span>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  <span>
                    {paymentMethodLabel(subscription.payment_method)}
                  </span>
                </div>
              </div>
            )}

            {subscription.mp_payment_id && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ID Pagamento MP</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{subscription.mp_payment_id}</span>
                </div>
              </div>
            )}

            {subscription.mp_preference_id && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ID Preferência MP</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{subscription.mp_preference_id}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Renovação Automática</span>
              <Badge variant={subscription.auto_renew ? 'default' : 'secondary'}>
                {subscription.auto_renew ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Ações */}
        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.status === 'ACTIVE' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="extend_days">Estender Validade (dias)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="extend_days"
                      type="number"
                      min="1"
                      value={extendDays}
                      onChange={(e) => setExtendDays(parseInt(e.target.value) || 30)}
                    />
                    <Button
                      onClick={() => extendMutation.mutate(extendDays)}
                      disabled={extendMutation.isPending}
                    >
                      {extendMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Estender'
                      )}
                    </Button>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      Cancelar Assinatura
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar Assinatura</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja cancelar esta assinatura? Esta ação não pode ser
                        desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {cancelMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Cancelando...
                          </>
                        ) : (
                          'Confirmar Cancelamento'
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}

            <div className="space-y-2">
              <Label>Alterar Status</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({ status: 'ACTIVE' })
                  }
                  disabled={updateMutation.isPending || subscription.status === 'ACTIVE'}
                >
                  Ativar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({ status: 'EXPIRED' })
                  }
                  disabled={updateMutation.isPending || subscription.status === 'EXPIRED'}
                >
                  Expirar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Histórico de Pagamentos */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Pagamentos</CardTitle>
          <CardDescription>
            {payments?.length || 0} pagamento(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">R$ {Number(payment.amount).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                    {payment.payment_method && (
                      <p className="text-xs text-muted-foreground">
                        Método: {payment.payment_method === 'CARD' ? 'Cartão' : 'PIX'}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      payment.status === 'APPROVED'
                        ? 'default'
                        : payment.status === 'PENDING'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    {payment.status === 'APPROVED'
                      ? 'Aprovado'
                      : payment.status === 'PENDING'
                      ? 'Pendente'
                      : payment.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum pagamento encontrado
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
