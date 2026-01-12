'use client';

import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function SubscribersListPage() {
  const router = useRouter();

  const { data: subscribers, isLoading } = useQuery({
    queryKey: ['admin', 'subscribers'],
    queryFn: () => adminService.listSubscribers(),
  });

  const columns = [
    {
      key: 'id',
      label: 'ID',
    },
    {
      key: 'email',
      label: 'Email',
    },
    {
      key: 'profile',
      label: 'Nome',
      render: (row: any) => row.profile?.full_name || '-',
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (row: any) => (
        <Badge variant={row.is_active ? 'default' : 'secondary'}>
          {row.is_active ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
    {
      key: 'subscription',
      label: 'Assinatura',
      render: (row: any) => {
        const sub = row.subscription;
        if (!sub) return <Badge variant="outline">Sem assinatura</Badge>;
        const isMvmPay = sub.payment_method === 'MVM_PAY' || !!sub.plan?.mvm_pay_plan_id_monthly || !!sub.plan?.mvm_pay_plan_id_quarterly;
        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant={
                sub.status === 'ACTIVE'
                  ? 'default'
                  : sub.status === 'EXPIRED'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {sub.plan?.name || sub.status}
            </Badge>
            {isMvmPay && <Badge variant="secondary">MvM Pay</Badge>}
            {sub.plan && (
              <span className="text-xs text-muted-foreground">
                {sub.status === 'ACTIVE' ? 'Ativo' : sub.status}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (row: any) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/subscribers-admin/subscribers/${row.id}`)}
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
        <h1 className="text-3xl font-bold">Lista de Assinantes</h1>
        <p className="text-muted-foreground">Gerenciar todos os assinantes do sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assinantes</CardTitle>
          <CardDescription>
            {subscribers?.length || 0} assinante(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={subscribers || []}
            columns={columns}
          />
        </CardContent>
      </Card>
    </div>
  );
}

