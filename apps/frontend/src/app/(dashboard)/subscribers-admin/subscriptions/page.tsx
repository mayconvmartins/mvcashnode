'use client';

import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';

export default function SubscriptionsPage() {
  const router = useRouter();

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () => adminService.listSubscriptions(),
  });

  const columns = [
    {
      key: 'id',
      label: 'ID',
    },
    {
      key: 'user',
      label: 'Usuário',
      render: (row: any) => row.user?.email || 'N/A',
    },
    {
      key: 'plan',
      label: 'Plano',
      render: (row: any) => row.plan?.name || 'N/A',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row: any) => {
        const statusColors: Record<string, "default" | "success" | "warning" | "outline" | "destructive" | "secondary"> = {
          ACTIVE: 'default',
          CANCELLED: 'secondary',
          EXPIRED: 'destructive',
          PENDING_PAYMENT: 'outline',
        };
        const isMvmPay = row.payment_method === 'MVM_PAY' || !!row.plan?.mvm_pay_plan_id_monthly || !!row.plan?.mvm_pay_plan_id_quarterly;
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={statusColors[row.status] || 'outline'}>
              {row.status}
            </Badge>
            {isMvmPay && <Badge variant="secondary">MvM Pay</Badge>}
          </div>
        );
      },
    },
    {
      key: 'end_date',
      label: 'Validade',
      render: (row: any) =>
        row.end_date
          ? format(new Date(row.end_date), "dd/MM/yyyy", { locale: ptBR })
          : 'N/A',
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (row: any) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/subscribers-admin/subscriptions/${row.id}`)}
        >
          Ver Detalhes
        </Button>
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
      <div>
        <h1 className="text-3xl font-bold">Assinaturas</h1>
        <p className="text-muted-foreground">Gerenciar todas as assinaturas dos assinantes</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Assinaturas</CardTitle>
          <CardDescription>
            {subscriptions?.length || 0} assinatura(s) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={subscriptions || []}
            columns={columns}
          />
        </CardContent>
      </Card>
    </div>
  );
}

