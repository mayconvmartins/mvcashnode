'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Eye, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/utils/format';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function PaymentsTab() {
  const queryClient = useQueryClient();
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [cancelSubscription, setCancelSubscription] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');

  const { data: payments, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'transfi', 'payments', statusFilter, paymentMethodFilter],
    queryFn: () => adminService.listTransFiPayments({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      payment_method: paymentMethodFilter !== 'all' ? paymentMethodFilter : undefined,
    }),
  });

  const { data: paymentDetails } = useQuery({
    queryKey: ['admin', 'transfi', 'payments', selectedPaymentId],
    queryFn: () => adminService.getTransFiPayment(selectedPaymentId!),
    enabled: !!selectedPaymentId,
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, cancelSubscription }: { id: number; cancelSubscription: boolean }) =>
      adminService.refundTransFiPayment(id, cancelSubscription),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'transfi', 'payments'] });
      toast.success(data.message || 'Pagamento estornado com sucesso!');
      setRefundConfirmOpen(false);
      setSelectedPaymentId(null);
      setCancelSubscription(false);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao estornar pagamento');
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => adminService.syncTransFiPayments(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'transfi', 'payments'] });
      toast.success(data.message || 'Sincronização iniciada! Verifique os pagamentos em alguns instantes.');
      setTimeout(() => {
        refetch();
      }, 3000);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao iniciar sincronização');
    },
  });

  const handleRefund = (paymentId: number) => {
    setSelectedPaymentId(paymentId);
    setRefundConfirmOpen(true);
  };

  const confirmRefund = () => {
    if (selectedPaymentId) {
      refundMutation.mutate({
        id: selectedPaymentId,
        cancelSubscription,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' | 'secondary'; label: string }> = {
      PENDING: { variant: 'warning', label: 'Pendente' },
      APPROVED: { variant: 'success', label: 'Aprovado' },
      REJECTED: { variant: 'destructive', label: 'Rejeitado' },
      CANCELLED: { variant: 'outline', label: 'Cancelado' },
      REFUNDED: { variant: 'secondary', label: 'Estornado' },
    };
    const statusInfo = statusMap[status] || { variant: 'default' as const, label: status };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const columns = [
    {
      key: 'id',
      label: 'ID',
      render: (row: any) => `#${row.id}`,
    },
    {
      key: 'subscription',
      label: 'Assinatura',
      render: (row: any) => (
        <div>
          <p className="font-medium">{row.subscription?.user?.email || 'N/A'}</p>
          <p className="text-xs text-muted-foreground">
            Plano: {row.subscription?.plan?.name || 'N/A'}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Valor',
      render: (row: any) => `R$ ${row.amount.toFixed(2)}`,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row: any) => getStatusBadge(row.status),
    },
    {
      key: 'payment_method',
      label: 'Método',
      render: (row: any) => (
        <Badge variant="outline">{row.payment_method || 'N/A'}</Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Data',
      render: (row: any) => formatDateTime(row.created_at),
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (row: any) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedPaymentId(row.id)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.status === 'APPROVED' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRefund(row.id)}
              disabled={refundMutation.isPending}
            >
              Estornar
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pagamentos</CardTitle>
              <CardDescription>
                {payments?.length || 0} pagamento(s) encontrado(s)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RotateCw className="h-4 w-4 mr-2" />
                    Sincronizar com TransFi
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="APPROVED">Aprovado</SelectItem>
                  <SelectItem value="REJECTED">Rejeitado</SelectItem>
                  <SelectItem value="CANCELLED">Cancelado</SelectItem>
                  <SelectItem value="REFUNDED">Estornado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Método</Label>
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="CARD">Cartão</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="CRYPTO">Crypto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataTable data={payments || []} columns={columns} />
        </CardContent>
      </Card>

      {/* Dialog de Detalhes do Pagamento */}
      {selectedPaymentId && paymentDetails && (
        <Dialog open={!!selectedPaymentId} onOpenChange={() => setSelectedPaymentId(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do Pagamento #{paymentDetails.id}</DialogTitle>
              <DialogDescription>
                Informações completas do pagamento e assinatura vinculada
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Order ID TransFi</Label>
                  <p className="font-mono text-sm">{paymentDetails.transfi_order_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor</Label>
                  <p className="font-semibold">R$ {paymentDetails.amount.toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(paymentDetails.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Método</Label>
                  <p>{paymentDetails.payment_method}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Assinatura Vinculada</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Usuário</Label>
                    <p>{paymentDetails.subscription?.user?.email}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Plano</Label>
                    <p>{paymentDetails.subscription?.plan?.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status da Assinatura</Label>
                    <p>{paymentDetails.subscription?.status}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Data de Criação</Label>
                    <p>{formatDateTime(paymentDetails.created_at)}</p>
                  </div>
                </div>
              </div>

              {paymentDetails.transfi_data && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Dados do TransFi</h3>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                    {JSON.stringify(paymentDetails.transfi_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPaymentId(null)}>
                Fechar
              </Button>
              {paymentDetails.status === 'APPROVED' && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setRefundConfirmOpen(true);
                  }}
                >
                  Estornar Pagamento
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog de Confirmação de Estorno */}
      <Dialog open={refundConfirmOpen} onOpenChange={setRefundConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Estorno</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja estornar este pagamento no TransFi?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="cancel_subscription"
                checked={cancelSubscription}
                onCheckedChange={setCancelSubscription}
              />
              <Label htmlFor="cancel_subscription" className="cursor-pointer">
                Cancelar assinatura relacionada ao pagamento estornado
              </Label>
            </div>
            {cancelSubscription && (
              <p className="text-sm text-muted-foreground">
                A assinatura será cancelada e o usuário será desativado automaticamente.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRefund}
              disabled={refundMutation.isPending}
            >
              {refundMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Estornando...
                </>
              ) : (
                'Confirmar Estorno'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
