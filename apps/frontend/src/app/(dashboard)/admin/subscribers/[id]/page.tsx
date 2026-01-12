'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, User, Mail, Phone, MapPin, CreditCard } from 'lucide-react';
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

export default function SubscriberDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const subscriberId = parseInt(params.id as string);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const { data: subscriber, isLoading } = useQuery({
    queryKey: ['admin', 'subscribers', subscriberId],
    queryFn: () => adminService.getSubscriber(subscriberId),
  });

  const { data: parameters } = useQuery({
    queryKey: ['admin', 'subscribers', subscriberId, 'parameters'],
    queryFn: () => adminService.getSubscriberParameters(subscriberId),
    enabled: !!subscriber,
  });

  const queryClient = useQueryClient();

  const deactivateMutation = useMutation({
    mutationFn: () => adminService.deactivateSubscriber(subscriberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscribers'] });
      toast.success('Assinante desativado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao desativar assinante');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (password: string) =>
      adminService.changeSubscriberPassword(subscriberId, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscribers'] });
      toast.success('Senha alterada com sucesso');
      setShowPasswordDialog(false);
      setNewPassword('');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao alterar senha');
    },
  });

  const activationLinkMutation = useMutation({
    mutationFn: () => adminService.generateMvmPayActivationLinkForSubscriber(subscriberId),
    onSuccess: async (data: any) => {
      const url = data?.activation_url;
      if (!url) {
        toast.success(data?.message || 'Link gerado');
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link de ativação copiado para a área de transferência');
      } catch {
        toast.success('Link gerado. Copie manualmente abaixo:');
        prompt('Link de ativação (copie):', url);
      }
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao gerar link de ativação');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!subscriber) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Assinante não encontrado</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const isMvmPay = subscriber.subscription?.payment_method === 'MVM_PAY' || !!subscriber.subscription?.plan?.mvm_pay_plan_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Detalhes do Assinante</h1>
          <p className="text-muted-foreground">{subscriber.email}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Dados Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle>Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriber.subscriber_profile && (
              <>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Nome Completo</p>
                    <p className="font-medium">
                      {subscriber.subscriber_profile.full_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{subscriber.subscriber_profile.email}</p>
                  </div>
                </div>

                {subscriber.subscriber_profile.cpf && (
                  <div>
                    <p className="text-sm text-muted-foreground">CPF</p>
                    <p className="font-medium">{subscriber.subscriber_profile.cpf}</p>
                  </div>
                )}

                {subscriber.subscriber_profile.birth_date && (
                  <div>
                    <p className="text-sm text-muted-foreground">Data de Nascimento</p>
                    <p className="font-medium">
                      {format(
                        new Date(subscriber.subscriber_profile.birth_date),
                        "dd/MM/yyyy",
                        { locale: ptBR }
                      )}
                    </p>
                  </div>
                )}

                {subscriber.subscriber_profile.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <p className="font-medium">{subscriber.subscriber_profile.phone}</p>
                    </div>
                  </div>
                )}

                {subscriber.subscriber_profile.whatsapp && (
                  <div>
                    <p className="text-sm text-muted-foreground">WhatsApp</p>
                    <p className="font-medium">{subscriber.subscriber_profile.whatsapp}</p>
                  </div>
                )}

                {subscriber.subscriber_profile.address_street && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm text-muted-foreground">Endereço</p>
                      <p className="font-medium">
                        {subscriber.subscriber_profile.address_street},{' '}
                        {subscriber.subscriber_profile.address_number}
                        {subscriber.subscriber_profile.address_complement &&
                          ` - ${subscriber.subscriber_profile.address_complement}`}
                        <br />
                        {subscriber.subscriber_profile.address_neighborhood},{' '}
                        {subscriber.subscriber_profile.address_city} -{' '}
                        {subscriber.subscriber_profile.address_state}
                        <br />
                        CEP: {subscriber.subscriber_profile.address_zipcode}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Assinatura */}
        <Card>
          <CardHeader>
            <CardTitle>Assinatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriber.subscription ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fonte</span>
                  {isMvmPay ? <Badge variant="secondary">MvM Pay</Badge> : <Badge variant="outline">Nativo</Badge>}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      subscriber.subscription.status === 'ACTIVE'
                        ? 'default'
                        : subscriber.subscription.status === 'EXPIRED'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {subscriber.subscription.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Plano</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{subscriber.subscription.plan?.name}</span>
                    {subscriber.subscription.plan?.mvm_pay_plan_id ? (
                      <Badge variant="outline">ID MvM {subscriber.subscription.plan.mvm_pay_plan_id}</Badge>
                    ) : null}
                  </div>
                </div>

                {subscriber.subscription.end_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Validade até</span>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <span>
                        {format(
                          new Date(subscriber.subscription.end_date),
                          "dd/MM/yyyy",
                          { locale: ptBR }
                        )}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    router.push(`/admin/subscriptions/${subscriber.subscription.id}`)
                  }
                >
                  Ver Detalhes da Assinatura
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma assinatura encontrada</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Parâmetros */}
      {parameters && (
        <Card>
          <CardHeader>
            <CardTitle>Parâmetros Configurados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Modo Padrão</p>
                <p className="font-medium">{parameters.default_trade_mode || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipo de Ordem Padrão</p>
                <p className="font-medium">{parameters.default_order_type || 'N/A'}</p>
              </div>
              {parameters.default_sl_pct && (
                <div>
                  <p className="text-sm text-muted-foreground">Stop Loss Padrão (%)</p>
                  <p className="font-medium">{Number(parameters.default_sl_pct).toFixed(2)}%</p>
                </div>
              )}
              {parameters.default_tp_pct && (
                <div>
                  <p className="text-sm text-muted-foreground">Take Profit Padrão (%)</p>
                  <p className="font-medium">{Number(parameters.default_tp_pct).toFixed(2)}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ações */}
      <Card>
        <CardHeader>
          <CardTitle>Ações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {isMvmPay && (
              <Button
                variant="outline"
                onClick={() => activationLinkMutation.mutate()}
                disabled={activationLinkMutation.isPending}
              >
                {activationLinkMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Gerando link...
                  </>
                ) : (
                  'Copiar link de ativação (MvM Pay)'
                )}
              </Button>
            )}

            <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Trocar Senha</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Trocar Senha</AlertDialogTitle>
                  <AlertDialogDescription>
                    Digite a nova senha para o assinante
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new_password">Nova Senha</Label>
                    <Input
                      id="new_password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                    />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (newPassword.length < 8) {
                        toast.error('Senha deve ter pelo menos 8 caracteres');
                        return;
                      }
                      changePasswordMutation.mutate(newPassword);
                    }}
                    disabled={changePasswordMutation.isPending}
                  >
                    {changePasswordMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Alterando...
                      </>
                    ) : (
                      'Confirmar'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {subscriber.is_active ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Desativar Assinante</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desativar Assinante</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja desativar este assinante? Ele perderá acesso à
                      plataforma.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deactivateMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deactivateMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Desativando...
                        </>
                      ) : (
                        'Confirmar'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                onClick={() => {
                  // TODO: Implementar ativação
                  toast.info('Funcionalidade de ativação em desenvolvimento');
                }}
              >
                Ativar Assinante
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
