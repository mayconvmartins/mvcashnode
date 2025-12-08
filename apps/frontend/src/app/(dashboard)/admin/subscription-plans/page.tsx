'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { PlanForm } from '@/components/admin/PlanForm';

export default function AdminSubscriptionPlansPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['admin', 'subscription-plans'],
    queryFn: () => adminService.listSubscriptionPlans(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminService.deleteSubscriptionPlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] });
      toast.success('Plano desativado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao desativar plano');
    },
  });

  const columns = [
    {
      key: 'id',
      label: 'ID',
    },
    {
      key: 'name',
      label: 'Nome',
    },
    {
      key: 'price_monthly',
      label: 'Preço Mensal',
      render: (row: any) => `R$ ${Number(row.price_monthly).toFixed(2)}`,
    },
    {
      key: 'price_quarterly',
      label: 'Preço Trimestral',
      render: (row: any) => `R$ ${Number(row.price_quarterly).toFixed(2)}`,
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
      key: 'actions',
      label: 'Ações',
      render: (row: any) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingPlan(row)}
          >
            Editar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm(`Deseja desativar o plano "${row.name}"?`)) {
                deleteMutation.mutate(row.id);
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Desativar'
            )}
          </Button>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Planos de Assinatura</h1>
          <p className="text-muted-foreground">Gerenciar planos disponíveis</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Criar Plano
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Planos</CardTitle>
          <CardDescription>
            {plans?.length || 0} plano(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable data={plans || []} columns={columns} searchKey="name" />
        </CardContent>
      </Card>

      <PlanForm
        open={showCreateModal || !!editingPlan}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false);
            setEditingPlan(null);
          }
        }}
        plan={editingPlan}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] });
          setShowCreateModal(false);
          setEditingPlan(null);
        }}
      />
    </div>
  );
}
