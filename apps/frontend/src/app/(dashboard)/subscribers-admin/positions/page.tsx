'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, Column } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Filter, Settings2, RefreshCw, TrendingUp, TrendingDown, User } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { SymbolDisplay } from '@/components/shared/SymbolDisplay';
import { SubscriberPosition } from '@/lib/types';

export default function SubscriberPositionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Filtros
  const [filters, setFilters] = useState({
    subscriber_id: searchParams.get('subscriber_id') || 'ALL',
    symbol: '',
    status: 'OPEN' as 'OPEN' | 'CLOSED' | 'ALL',
    trade_mode: 'REAL' as 'REAL' | 'SIMULATION' | 'ALL',
    sort_by: 'created_at' as 'created_at' | 'pnl_pct' | 'invested_value_usd',
    sort_order: 'desc' as 'asc' | 'desc',
    page: 1,
    limit: 50,
  });

  // Seleção de posições
  const [selectedPositions, setSelectedPositions] = useState<number[]>([]);
  const [showBulkUpdateDialog, setShowBulkUpdateDialog] = useState(false);
  const [bulkUpdateData, setBulkUpdateData] = useState({
    lock_sell_by_webhook: false,
    sl_enabled: false,
    sl_pct: '',
    tp_enabled: false,
    tp_pct: '',
    sg_enabled: false,
    sg_pct: '',
    sg_drop_pct: '',
    tsg_enabled: false,
    tsg_activation_pct: '',
    tsg_drop_pct: '',
  });

  // Buscar assinantes para filtro
  const { data: subscribers } = useQuery({
    queryKey: ['admin', 'subscribers'],
    queryFn: () => adminService.listSubscribers(),
  });

  // Buscar posições
  const { data: positionsData, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'subscriber-positions', filters],
    queryFn: () => adminService.listSubscriberPositions({
      subscriber_id: filters.subscriber_id && filters.subscriber_id !== 'ALL' ? parseInt(filters.subscriber_id) : undefined,
      symbol: filters.symbol || undefined,
      status: filters.status && filters.status !== 'ALL' ? filters.status : undefined,
      trade_mode: filters.trade_mode && filters.trade_mode !== 'ALL' ? filters.trade_mode : undefined,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order,
      page: filters.page,
      limit: filters.limit,
    }),
  });

  // Mutation para bulk update
  const bulkUpdateMutation = useMutation({
    mutationFn: (data: any) => adminService.bulkUpdateSubscriberPositions(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriber-positions'] });
      toast.success(`${result.updated} posição(ões) atualizada(s)`);
      setShowBulkUpdateDialog(false);
      setSelectedPositions([]);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao atualizar posições');
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPositions(positionsData?.data?.map((p: any) => p.id) || []);
    } else {
      setSelectedPositions([]);
    }
  };

  const handleSelectPosition = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedPositions([...selectedPositions, id]);
    } else {
      setSelectedPositions(selectedPositions.filter((p) => p !== id));
    }
  };

  const handleBulkUpdate = () => {
    if (selectedPositions.length === 0) {
      toast.error('Selecione pelo menos uma posição');
      return;
    }

    const updateData: any = { positionIds: selectedPositions };

    if (bulkUpdateData.lock_sell_by_webhook !== undefined) {
      updateData.lock_sell_by_webhook = bulkUpdateData.lock_sell_by_webhook;
    }
    if (bulkUpdateData.sl_enabled !== undefined) {
      updateData.sl_enabled = bulkUpdateData.sl_enabled;
      if (bulkUpdateData.sl_enabled && bulkUpdateData.sl_pct) {
        updateData.sl_pct = parseFloat(bulkUpdateData.sl_pct);
      }
    }
    if (bulkUpdateData.tp_enabled !== undefined) {
      updateData.tp_enabled = bulkUpdateData.tp_enabled;
      if (bulkUpdateData.tp_enabled && bulkUpdateData.tp_pct) {
        updateData.tp_pct = parseFloat(bulkUpdateData.tp_pct);
      }
    }
    if (bulkUpdateData.sg_enabled !== undefined) {
      updateData.sg_enabled = bulkUpdateData.sg_enabled;
      if (bulkUpdateData.sg_enabled && bulkUpdateData.sg_pct) {
        updateData.sg_pct = parseFloat(bulkUpdateData.sg_pct);
      }
      if (bulkUpdateData.sg_enabled && bulkUpdateData.sg_drop_pct) {
        updateData.sg_drop_pct = parseFloat(bulkUpdateData.sg_drop_pct);
      }
    }
    if (bulkUpdateData.tsg_enabled !== undefined) {
      updateData.tsg_enabled = bulkUpdateData.tsg_enabled;
      if (bulkUpdateData.tsg_enabled && bulkUpdateData.tsg_activation_pct) {
        updateData.tsg_activation_pct = parseFloat(bulkUpdateData.tsg_activation_pct);
      }
      if (bulkUpdateData.tsg_enabled && bulkUpdateData.tsg_drop_pct) {
        updateData.tsg_drop_pct = parseFloat(bulkUpdateData.tsg_drop_pct);
      }
    }

    bulkUpdateMutation.mutate(updateData);
  };

  const columns: Column<SubscriberPosition>[] = [
    {
      key: 'select',
      label: (
        <Checkbox
          checked={selectedPositions.length === (positionsData?.data?.length || 0) && selectedPositions.length > 0}
          onCheckedChange={handleSelectAll}
        />
      ) as any,
      render: (pos) => (
        <Checkbox
          checked={selectedPositions.includes(pos.id)}
          onCheckedChange={(checked) => handleSelectPosition(pos.id, checked as boolean)}
        />
      ),
    },
    {
      key: 'subscriber',
      label: 'Assinante',
      render: (pos) => (
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
            {pos.subscriber?.email?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{pos.subscriber?.full_name || pos.subscriber?.email}</span>
            <span className="text-xs text-muted-foreground">{pos.subscriber?.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'symbol',
      label: 'Símbolo',
      render: (pos) => (
        <div className="flex items-center gap-2">
          <SymbolDisplay symbol={pos.symbol} exchange={(pos as any).exchange_account?.exchange || 'BINANCE_SPOT'} showExchange={false} />
          {pos.lock_sell_by_webhook && (
            <Badge variant="outline" className="text-xs">
              🔒 Webhook
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'qty_remaining',
      label: 'Quantidade',
      render: (pos) => (
        <span className="font-mono text-sm">
          {Number(pos.qty_remaining || 0).toFixed(4)} / {Number(pos.qty_total || 0).toFixed(4)}
        </span>
      ),
    },
    {
      key: 'price_open',
      label: 'Preço Entrada',
      render: (pos) => <span className="font-mono">{formatCurrency(Number(pos.price_open || 0))}</span>,
    },
    {
      key: 'current_price',
      label: 'Preço Atual',
      render: (pos) => <span className="font-mono">{formatCurrency(pos.current_price || 0)}</span>,
    },
    {
      key: 'unrealized_pnl',
      label: 'PnL',
      render: (pos) => {
        const pnlPct = pos.unrealized_pnl_pct || 0;
        const isProfit = pnlPct >= 0;
        return (
          <div className="flex items-center gap-1">
            {isProfit ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            <span className={isProfit ? 'text-green-600' : 'text-red-600'}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </span>
          </div>
        );
      },
    },
    {
      key: 'invested_value',
      label: 'Valor Investido',
      render: (pos) => formatCurrency(pos.invested_value_usd || 0),
    },
    {
      key: 'sltp',
      label: 'SL/TP',
      render: (pos) => (
        <div className="flex flex-wrap gap-1">
          {pos.sl_enabled && (
            <Badge variant="destructive" className="text-xs">
              SL {pos.sl_pct ? `${Number(pos.sl_pct).toFixed(1)}%` : ''}
            </Badge>
          )}
          {pos.tp_enabled && (
            <Badge variant="default" className="text-xs">
              TP {pos.tp_pct ? `${Number(pos.tp_pct).toFixed(1)}%` : ''}
            </Badge>
          )}
          {pos.sg_enabled && (
            <Badge variant="secondary" className="text-xs">
              SG
            </Badge>
          )}
          {pos.tsg_enabled && (
            <Badge className="text-xs bg-purple-500/20 text-purple-600 dark:text-purple-400">
              TSG
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: 'Abertura',
      render: (pos) => formatDateTime(pos.created_at),
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (pos) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/subscribers-admin/positions/${pos.id}`)}
        >
          Detalhes
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Posições de Assinantes</h1>
          <p className="text-muted-foreground">
            Gerenciamento centralizado de todas as posições de assinantes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          {selectedPositions.length > 0 && (
            <Button onClick={() => setShowBulkUpdateDialog(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Atualizar Selecionadas ({selectedPositions.length})
            </Button>
          )}
        </div>
      </div>

      {/* Resumo */}
      {positionsData?.summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Posições</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{positionsData.summary.total_positions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Investido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(positionsData.summary.total_invested_usd)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">PnL Não Realizado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${positionsData.summary.total_unrealized_pnl_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(positionsData.summary.total_unrealized_pnl_usd)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">PnL Realizado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${positionsData.summary.total_realized_pnl_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(positionsData.summary.total_realized_pnl_usd)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Assinante</Label>
              <Select
                value={filters.subscriber_id}
                onValueChange={(value) => setFilters({ ...filters, subscriber_id: value, page: 1 })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {subscribers?.map((sub: any) => (
                    <SelectItem key={sub.id} value={sub.id.toString()}>
                      {sub.profile?.full_name || sub.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Símbolo</Label>
              <Input
                placeholder="Ex: BTCUSDT"
                value={filters.symbol}
                onChange={(e) => setFilters({ ...filters, symbol: e.target.value, page: 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({ ...filters, status: value as any, page: 1 })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="OPEN">Abertas</SelectItem>
                  <SelectItem value="CLOSED">Fechadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select
                value={filters.trade_mode}
                onValueChange={(value) => setFilters({ ...filters, trade_mode: value as any, page: 1 })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="REAL">REAL</SelectItem>
                  <SelectItem value="SIMULATION">SIMULATION</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ordenar por</Label>
              <Select
                value={filters.sort_by}
                onValueChange={(value) => setFilters({ ...filters, sort_by: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Data</SelectItem>
                  <SelectItem value="pnl_pct">PnL %</SelectItem>
                  <SelectItem value="invested_value_usd">Valor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Posições</CardTitle>
          <CardDescription>
            {positionsData?.pagination?.total || 0} posição(ões) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <DataTable
              data={positionsData?.data || []}
              columns={columns}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialog de Bulk Update */}
      <Dialog open={showBulkUpdateDialog} onOpenChange={setShowBulkUpdateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Atualizar {selectedPositions.length} Posições</DialogTitle>
            <DialogDescription>
              Configure os parâmetros que serão aplicados às posições selecionadas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Webhook Lock */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Bloquear Venda por Webhook</Label>
                <p className="text-sm text-muted-foreground">Impede vendas automáticas via webhook</p>
              </div>
              <Switch
                checked={bulkUpdateData.lock_sell_by_webhook}
                onCheckedChange={(checked) => setBulkUpdateData({ ...bulkUpdateData, lock_sell_by_webhook: checked })}
              />
            </div>

            {/* Stop Loss */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>Stop Loss</Label>
                <Switch
                  checked={bulkUpdateData.sl_enabled}
                  onCheckedChange={(checked) => setBulkUpdateData({ ...bulkUpdateData, sl_enabled: checked })}
                />
              </div>
              {bulkUpdateData.sl_enabled && (
                <div className="space-y-2">
                  <Label>SL (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 5"
                    value={bulkUpdateData.sl_pct}
                    onChange={(e) => setBulkUpdateData({ ...bulkUpdateData, sl_pct: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Take Profit */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>Take Profit</Label>
                <Switch
                  checked={bulkUpdateData.tp_enabled}
                  onCheckedChange={(checked) => setBulkUpdateData({ ...bulkUpdateData, tp_enabled: checked })}
                />
              </div>
              {bulkUpdateData.tp_enabled && (
                <div className="space-y-2">
                  <Label>TP (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 10"
                    value={bulkUpdateData.tp_pct}
                    onChange={(e) => setBulkUpdateData({ ...bulkUpdateData, tp_pct: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Stop Gain */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>Stop Gain (SG)</Label>
                <Switch
                  checked={bulkUpdateData.sg_enabled}
                  onCheckedChange={(checked) => setBulkUpdateData({ ...bulkUpdateData, sg_enabled: checked })}
                />
              </div>
              {bulkUpdateData.sg_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ativação (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 3"
                      value={bulkUpdateData.sg_pct}
                      onChange={(e) => setBulkUpdateData({ ...bulkUpdateData, sg_pct: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Queda (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 1"
                      value={bulkUpdateData.sg_drop_pct}
                      onChange={(e) => setBulkUpdateData({ ...bulkUpdateData, sg_drop_pct: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Trailing Stop Gain */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trailing Stop Gain (TSG)</Label>
                  <p className="text-xs text-muted-foreground">Desativa TP e SG automaticamente</p>
                </div>
                <Switch
                  checked={bulkUpdateData.tsg_enabled}
                  onCheckedChange={(checked) => setBulkUpdateData({ ...bulkUpdateData, tsg_enabled: checked })}
                />
              </div>
              {bulkUpdateData.tsg_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Ativação (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 2"
                      value={bulkUpdateData.tsg_activation_pct}
                      onChange={(e) => setBulkUpdateData({ ...bulkUpdateData, tsg_activation_pct: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Queda (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 0.5"
                      value={bulkUpdateData.tsg_drop_pct}
                      onChange={(e) => setBulkUpdateData({ ...bulkUpdateData, tsg_drop_pct: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkUpdateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleBulkUpdate} disabled={bulkUpdateMutation.isPending}>
              {bulkUpdateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Atualizando...
                </>
              ) : (
                'Aplicar Alterações'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

