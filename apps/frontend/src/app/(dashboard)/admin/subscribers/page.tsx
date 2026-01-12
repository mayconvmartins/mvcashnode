'use client';

import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AdminSubscribersPage() {
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
        if (!sub) return 'N/A';
        const isMvmPay = sub.payment_method === 'MVM_PAY' || !!sub.plan?.mvm_pay_plan_id;
        return (
          <div className="flex items-center gap-2">
            <Badge
              variant={
                sub.status === 'ACTIVE'
                  ? 'default'
                  : sub.status === 'EXPIRED'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {sub.status}
            </Badge>
            {isMvmPay ? (
              <Badge variant="secondary">MvM Pay</Badge>
            ) : (
              <Badge variant="outline">Nativo</Badge>
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
          onClick={() => router.push(`/admin/subscribers/${row.id}`)}
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
        <h1 className="text-3xl font-bold">Assinantes</h1>
        <p className="text-muted-foreground">Gerenciar todos os assinantes</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Assinantes</CardTitle>
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
