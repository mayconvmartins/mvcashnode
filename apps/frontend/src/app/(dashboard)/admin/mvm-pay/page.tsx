'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';

export default function AdminMvmPayPage() {
  const qc = useQueryClient();
  const [apiSecret, setApiSecret] = useState('');
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');

  const [logFilters, setLogFilters] = useState({
    level: '',
    source: '',
    email: '',
    path: '',
  });

  const { data: providerCfg } = useQuery({
    queryKey: ['admin', 'subscription-provider'],
    queryFn: () => adminService.getSubscriptionProvider(),
  });

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['admin', 'mvm-pay-config'],
    queryFn: () => adminService.getMvmPayConfig(),
  });

  const providerMutation = useMutation({
    mutationFn: (provider: 'native' | 'mvm_pay') => adminService.setSubscriptionProvider(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'subscription-provider'] });
      toast.success('Provedor de assinatura atualizado!');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao atualizar provedor'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => adminService.updateMvmPayConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'mvm-pay-config'] });
      toast.success('Configuração salva!');
      setApiSecret('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao salvar configuração'),
  });

  const testMutation = useMutation({
    mutationFn: () => adminService.testMvmPayConnection(),
    onSuccess: (data: any) => {
      if (data?.success) toast.success(data?.message || 'OK');
      else toast.error(data?.error || data?.message || 'Falha');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro no teste'),
  });

  const { data: logsPage, isLoading: isLogsLoading } = useQuery({
    queryKey: ['admin', 'mvm-pay-logs', logFilters],
    queryFn: () =>
      adminService.getMvmPayLogs({
        page: 1,
        limit: 100,
        level: logFilters.level || undefined,
        source: logFilters.source || undefined,
        email: logFilters.email || undefined,
        path: logFilters.path || undefined,
      }),
    refetchInterval: activeTab === 'logs' ? 5000 : false,
  });

  const [form, setForm] = useState({
    base_url: '',
    checkout_url: '',
    api_key: '',
    product_id: 0,
    is_active: false,
  });

  // inicializar quando carregar config
  if (!isLoading && cfg && form.base_url === '' && form.checkout_url === '' && form.api_key === '' && form.product_id === 0) {
    setForm({
      base_url: cfg?.base_url || '',
      checkout_url: cfg?.checkout_url || '',
      api_key: cfg?.api_key || '',
      product_id: cfg?.product_id || 0,
      is_active: !!cfg?.is_active,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">MvM Pay</h1>
        <p className="text-muted-foreground">
          Configure o checkout externo e a integração via Partner API (HMAC).
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Provedor de Assinatura</CardTitle>
              <CardDescription>Selecione entre modo nativo e MvM Pay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>Modo</Label>
              <Select
                value={(providerCfg?.provider || 'native') as any}
                onValueChange={(v) => providerMutation.mutate(v as any)}
                disabled={providerMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">Nativo</SelectItem>
                  <SelectItem value="mvm_pay">MvM Pay</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuração</CardTitle>
              <CardDescription>Dados necessários para assinar requests e gerar redirect.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="base_url">Base URL (Partner API)</Label>
                <Input
                  id="base_url"
                  placeholder="https://SEU_DOMINIO.com/api/partner_api.php"
                  value={form.base_url}
                  onChange={(e) => setForm((s) => ({ ...s, base_url: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="checkout_url">Checkout URL (redirect)</Label>
                <Input
                  id="checkout_url"
                  placeholder="https://pay.seudominio.com/checkout"
                  value={form.checkout_url}
                  onChange={(e) => setForm((s) => ({ ...s, checkout_url: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="api_key">API Key</Label>
                  <Input
                    id="api_key"
                    value={form.api_key}
                    onChange={(e) => setForm((s) => ({ ...s, api_key: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product_id">product_id</Label>
                  <Input
                    id="product_id"
                    type="number"
                    min="1"
                    value={form.product_id || ''}
                    onChange={(e) => setForm((s) => ({ ...s, product_id: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api_secret">API Secret</Label>
                <Input
                  id="api_secret"
                  type="password"
                  placeholder={cfg ? '•••••••• (mantenha vazio para não trocar)' : 'Cole o secret'}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Por segurança, o secret não é exibido. Para alterar, preencha aqui.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm((s) => ({ ...s, is_active: checked }))}
                />
                <Label htmlFor="is_active" className="cursor-pointer">Ativo</Label>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveMutation.mutate({
                      ...form,
                      ...(apiSecret ? { api_secret: apiSecret } : {}),
                    })
                  }
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Testar conexão'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Logs do MvM Pay</CardTitle>
              <CardDescription>Chamadas API, sync, erros e duração (atualiza automaticamente).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label>Nível</Label>
                  <Input value={logFilters.level} onChange={(e) => setLogFilters((s) => ({ ...s, level: e.target.value }))} placeholder="INFO/WARN/ERROR" />
                </div>
                <div className="space-y-1">
                  <Label>Fonte</Label>
                  <Input value={logFilters.source} onChange={(e) => setLogFilters((s) => ({ ...s, source: e.target.value }))} placeholder="API/SYNC" />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={logFilters.email} onChange={(e) => setLogFilters((s) => ({ ...s, email: e.target.value }))} placeholder="contém..." />
                </div>
                <div className="space-y-1">
                  <Label>Path</Label>
                  <Input value={logFilters.path} onChange={(e) => setLogFilters((s) => ({ ...s, path: e.target.value }))} placeholder="/plans, /sync/users..." />
                </div>
              </div>

              {isLogsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <DataTable
                  data={logsPage?.items || []}
                  columns={[
                    {
                      key: 'created_at',
                      label: 'Data',
                      render: (row: any) => new Date(row.created_at).toLocaleString(),
                    },
                    {
                      key: 'level',
                      label: 'Nível',
                      render: (row: any) => (
                        <Badge variant={row.level === 'ERROR' ? 'destructive' : row.level === 'WARN' ? 'secondary' : 'outline'}>
                          {row.level}
                        </Badge>
                      ),
                    },
                    { key: 'source', label: 'Fonte' },
                    { key: 'action', label: 'Ação', render: (row: any) => row.action || '-' },
                    { key: 'path', label: 'Path', render: (row: any) => row.path || '-' },
                    { key: 'status_code', label: 'HTTP', render: (row: any) => row.status_code || '-' },
                    { key: 'duration_ms', label: 'Duração', render: (row: any) => row.duration_ms ? `${row.duration_ms}ms` : '-' },
                    { key: 'email', label: 'Email', render: (row: any) => row.email || '-' },
                    { key: 'error_message', label: 'Erro', render: (row: any) => row.error_message || '-' },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

