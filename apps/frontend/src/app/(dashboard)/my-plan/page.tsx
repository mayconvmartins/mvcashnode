'use client';

import { useSubscription } from '@/lib/hooks/useSubscription';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, CreditCard, AlertCircle } from 'lucide-react';
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
import { useState, useEffect } from 'react';

export default function MyPlanPage() {
  const { subscription, plan, isLoading, refetch, cancel, renew, isCancelling, isRenewing } =
    useSubscription();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  useEffect(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!subscription || !plan) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma assinatura encontrada</h3>
            <p className="text-muted-foreground mb-4">
              Você ainda não possui uma assinatura ativa.
            </p>
            <Button onClick={() => (window.location.href = '/subscribe')}>
              Assinar Agora
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isActive = subscription.status === 'ACTIVE';
  const isExpired = subscription.status === 'EXPIRED';
  const isCancelled = subscription.status === 'CANCELLED';
  const isPending = subscription.status === 'PENDING_PAYMENT';

  const endDate = subscription.end_date
    ? new Date(subscription.end_date)
    : null;
  const daysRemaining = endDate
    ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Meu Plano</h1>
        <p className="text-muted-foreground">Gerencie sua assinatura</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Plano Atual */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{plan.plan?.name || 'Plano'}</CardTitle>
              <Badge
                variant={
                  isActive
                    ? 'default'
                    : isExpired
                    ? 'destructive'
                    : isCancelled
                    ? 'secondary'
                    : 'outline'
                }
              >
                {isActive
                  ? 'Ativo'
                  : isExpired
                  ? 'Expirado'
                  : isCancelled
                  ? 'Cancelado'
                  : isPending
                  ? 'Aguardando Pagamento'
                  : subscription.status}
              </Badge>
            </div>
            <CardDescription>{plan.plan?.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Validade até:</span>
              <span className="font-medium">
                {endDate
                  ? format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : 'Não definida'}
              </span>
            </div>

            {isActive && endDate && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Dias restantes</p>
                <p className="text-2xl font-bold">{daysRemaining}</p>
              </div>
            )}

            {subscription.payment_method && (
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Método de pagamento:</span>
                <span className="font-medium">
                  {subscription.payment_method === 'CARD' ? 'Cartão' : 'PIX'}
                </span>
              </div>
            )}

            {subscription.mp_payment_id && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">ID Pagamento:</span>
                <span className="font-mono text-xs">{subscription.mp_payment_id}</span>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              {isActive && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => renew('monthly')}
                    disabled={isRenewing}
                    className="flex-1"
                  >
                    {isRenewing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processando...
                      </>
                    ) : (
                      'Renovar (Mensal)'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => renew('quarterly')}
                    disabled={isRenewing}
                    className="flex-1"
                  >
                    {isRenewing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processando...
                      </>
                    ) : (
                      'Renovar (Trimestral)'
                    )}
                  </Button>
                </>
              )}

              {isActive && (
                <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex-1">
                      Cancelar Assinatura
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar Assinatura</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja cancelar sua assinatura? Você perderá o acesso à
                        plataforma após o término do período pago.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          cancel();
                          setShowCancelDialog(false);
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isCancelling ? (
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
              )}

              {(isExpired || isCancelled) && (
                <Button
                  onClick={() => (window.location.href = '/subscribe')}
                  className="flex-1"
                >
                  Assinar Novamente
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Histórico de Pagamentos */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Pagamentos</CardTitle>
            <CardDescription>Últimos pagamentos realizados</CardDescription>
          </CardHeader>
          <CardContent>
            {subscription.payments && subscription.payments.length > 0 ? (
              <div className="space-y-3">
                {subscription.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        R$ {Number(payment.amount).toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(payment.created_at), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
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
    </div>
  );
}
