'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Calendar, CreditCard, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function SubscriptionDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const subscriptionId = parseInt(params.id as string);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', subscriptionId],
    queryFn: () => adminService.getSubscription(subscriptionId),
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

  const isMvmPay = subscription.origin_provider === 'mvm_pay';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/subscribers-admin/subscriptions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Assinatura #{subscription.id}</h1>
          <p className="text-muted-foreground">{subscription.user?.email}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Dados do Assinante
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{subscription.user?.email}</p>
            </div>
            {subscription.user?.profile?.full_name && (
              <div>
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium">{subscription.user?.profile?.full_name}</p>
              </div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/subscribers-admin/subscribers/${subscription.user_id}`)}
            >
              Ver Perfil do Assinante
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Plano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                <Badge variant={statusColors[subscription.status] || 'outline'}>
                  {subscription.status}
                </Badge>
                {isMvmPay && <Badge variant="secondary">MvM Pay</Badge>}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Plano</p>
              <p className="font-medium">{subscription.plan?.name || 'N/A'}</p>
            </div>
            {subscription.plan?.price && (
              <div>
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="font-medium">
                  R$ {Number(subscription.plan.price).toFixed(2)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Data de Início</p>
                <p className="font-medium">
                  {subscription.start_date
                    ? format(new Date(subscription.start_date), "dd/MM/yyyy", { locale: ptBR })
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data de Término</p>
                <p className="font-medium">
                  {subscription.end_date
                    ? format(new Date(subscription.end_date), "dd/MM/yyyy", { locale: ptBR })
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Criado em</p>
                <p className="font-medium">
                  {subscription.created_at
                    ? format(new Date(subscription.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

