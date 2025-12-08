'use client';

import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSubscriberParametersPage() {
  const router = useRouter();

  const { data: parameters, isLoading } = useQuery({
    queryKey: ['admin', 'subscriber-parameters'],
    queryFn: () => adminService.listSubscriberParameters(),
  });

  const columns = [
    {
      key: 'user',
      label: 'Usuário',
      render: (row: any) => row.user?.email || 'N/A',
    },
    {
      key: 'default_trade_mode',
      label: 'Modo Padrão',
    },
    {
      key: 'default_order_type',
      label: 'Tipo de Ordem Padrão',
    },
    {
      key: 'default_sl_pct',
      label: 'SL Padrão (%)',
      render: (row: any) => row.default_sl_pct || 'N/A',
    },
    {
      key: 'default_tp_pct',
      label: 'TP Padrão (%)',
      render: (row: any) => row.default_tp_pct || 'N/A',
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (row: any) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // TODO: Abrir modal de edição
            toast.info('Funcionalidade de edição em desenvolvimento');
          }}
        >
          Editar
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
        <h1 className="text-3xl font-bold">Parâmetros de Assinantes</h1>
        <p className="text-muted-foreground">
          Configurar parâmetros padrão aplicados automaticamente
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Parâmetros</CardTitle>
          <CardDescription>
            {parameters?.length || 0} configuração(ões) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={parameters || []}
            columns={columns}
          />
        </CardContent>
      </Card>
    </div>
  );
}
