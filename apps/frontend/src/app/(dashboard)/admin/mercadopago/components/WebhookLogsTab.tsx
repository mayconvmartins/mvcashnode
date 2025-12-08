'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Eye } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function WebhookLogsTab() {
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [processedFilter, setProcessedFilter] = useState<string>('all');

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'mercadopago', 'webhook-logs', eventTypeFilter, processedFilter],
    queryFn: () => adminService.listMercadoPagoWebhookLogs({
      mp_event_type: eventTypeFilter !== 'all' ? eventTypeFilter : undefined,
      processed: processedFilter !== 'all' ? processedFilter === 'true' : undefined,
    }),
  });

  const { data: logDetails } = useQuery({
    queryKey: ['admin', 'mercadopago', 'webhook-logs', selectedLogId],
    queryFn: () => adminService.getMercadoPagoWebhookLog(selectedLogId!),
    enabled: !!selectedLogId,
  });

  const columns = [
    {
      key: 'id',
      label: 'ID',
      render: (row: any) => `#${row.id}`,
    },
    {
      key: 'mp_event_type',
      label: 'Tipo',
      render: (row: any) => (
        <Badge variant="outline">{row.mp_event_type || 'N/A'}</Badge>
      ),
    },
    {
      key: 'mp_resource_id',
      label: 'Resource ID',
      render: (row: any) => (
        <span className="font-mono text-sm">{row.mp_resource_id || 'N/A'}</span>
      ),
    },
    {
      key: 'processed',
      label: 'Processado',
      render: (row: any) => (
        <Badge variant={row.processed ? 'success' : 'warning'}>
          {row.processed ? 'Sim' : 'Não'}
        </Badge>
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedLogId(row.id)}
        >
          <Eye className="h-4 w-4" />
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Logs de Webhook</CardTitle>
              <CardDescription>
                {logs?.length || 0} evento(s) de webhook registrado(s)
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Tipo de Evento</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="preapproval">Preapproval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Processado</Label>
              <Select value={processedFilter} onValueChange={setProcessedFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Processado</SelectItem>
                  <SelectItem value="false">Não Processado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataTable data={logs || []} columns={columns} />
        </CardContent>
      </Card>

      {/* Dialog de Detalhes do Log */}
      {selectedLogId && logDetails && (
        <Dialog open={!!selectedLogId} onOpenChange={() => setSelectedLogId(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do Evento #{logDetails.id}</DialogTitle>
              <DialogDescription>
                Informações completas do evento de webhook recebido
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Event ID (MP)</Label>
                  <p className="font-mono text-sm">{logDetails.mp_event_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Tipo</Label>
                  <Badge variant="outline">{logDetails.mp_event_type}</Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Resource ID</Label>
                  <p className="font-mono text-sm">{logDetails.mp_resource_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Processado</Label>
                  <Badge variant={logDetails.processed ? 'success' : 'warning'}>
                    {logDetails.processed ? 'Sim' : 'Não'}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data de Recebimento</Label>
                  <p>{formatDateTime(logDetails.created_at)}</p>
                </div>
                {logDetails.processed_at && (
                  <div>
                    <Label className="text-muted-foreground">Data de Processamento</Label>
                    <p>{formatDateTime(logDetails.processed_at)}</p>
                  </div>
                )}
              </div>

              {logDetails.raw_payload_json && (
                <div className="border-t pt-4">
                  <Label className="text-muted-foreground mb-2 block">Payload Completo</Label>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-96">
                    {JSON.stringify(logDetails.raw_payload_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setSelectedLogId(null)}>
                Fechar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
