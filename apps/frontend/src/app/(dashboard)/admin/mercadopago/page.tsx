'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function MercadoPagoConfigPage() {
  const queryClient = useQueryClient();
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [formData, setFormData] = useState({
    access_token: '',
    public_key: '',
    webhook_secret: '',
    environment: 'sandbox' as 'sandbox' | 'production',
    webhook_url: '',
    is_active: false,
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['admin', 'mercadopago', 'config'],
    queryFn: () => adminService.getMercadoPagoConfig(),
  });

  useEffect(() => {
    if (config) {
      setFormData({
        access_token: '', // Não preencher token por segurança
        public_key: config.public_key || '',
        webhook_secret: '', // Não preencher secret por segurança
        environment: (config.environment as 'sandbox' | 'production') || 'sandbox',
        webhook_url: config.webhook_url || '',
        is_active: config.is_active || false,
      });
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => adminService.updateMercadoPagoConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'mercadopago'] });
      toast.success('Configuração salva com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao salvar configuração');
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: () => adminService.testMercadoPagoConnection(),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message || 'Erro ao testar conexão');
      }
    },
    onError: () => {
      toast.error('Erro ao testar conexão');
    },
  });

  const handleSave = () => {
    if (!formData.access_token && !config) {
      toast.error('Access Token é obrigatório');
      return;
    }
    if (!formData.public_key) {
      toast.error('Public Key é obrigatória');
      return;
    }
    updateMutation.mutate(formData);
  };

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
        <h1 className="text-3xl font-bold">Configuração Mercado Pago</h1>
        <p className="text-muted-foreground">
          Configure as credenciais e parâmetros da integração com Mercado Pago
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credenciais</CardTitle>
          <CardDescription>
            Configure suas credenciais do Mercado Pago. Os dados sensíveis são
            criptografados antes de serem armazenados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token *</Label>
            <div className="flex gap-2">
              <Input
                id="access_token"
                type={showAccessToken ? 'text' : 'password'}
                placeholder={config ? '••••••••••••' : 'Seu Access Token do Mercado Pago'}
                value={formData.access_token}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, access_token: e.target.value }))
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowAccessToken(!showAccessToken)}
              >
                {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {config
                ? 'Deixe em branco para manter o token atual. Preencha apenas se quiser alterar.'
                : 'Token de acesso do Mercado Pago (obrigatório na primeira configuração)'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="public_key">Public Key *</Label>
            <Input
              id="public_key"
              type="text"
              placeholder="Sua Public Key do Mercado Pago"
              value={formData.public_key}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, public_key: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook_secret">Webhook Secret</Label>
            <div className="flex gap-2">
              <Input
                id="webhook_secret"
                type={showWebhookSecret ? 'text' : 'password'}
                placeholder={config ? '••••••••••••' : 'Secret para validar webhooks (opcional)'}
                value={formData.webhook_secret}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, webhook_secret: e.target.value }))
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
              >
                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {config
                ? 'Deixe em branco para manter o secret atual.'
                : 'Secret para validar a assinatura dos webhooks do Mercado Pago'}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="environment">Ambiente</Label>
              <Select
                value={formData.environment}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    environment: value as 'sandbox' | 'production',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (Teste)</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_active">Status</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  {formData.is_active ? 'Ativo' : 'Inativo'}
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook_url">Webhook URL</Label>
            <Input
              id="webhook_url"
              type="url"
              placeholder="https://seu-dominio.com/subscriptions/webhooks/mercadopago"
              value={formData.webhook_url}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, webhook_url: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              URL pública onde o Mercado Pago enviará notificações de pagamento
            </p>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex-1"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                'Salvar Configuração'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending || !formData.is_active}
            >
              {testConnectionMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Testando...
                </>
              ) : (
                'Testar Conexão'
              )}
            </Button>
          </div>

          {testConnectionMutation.data && (
            <div
              className={`p-4 rounded-lg flex items-center gap-2 ${
                testConnectionMutation.data.success
                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                  : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              {testConnectionMutation.data.success ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <div>
                <p className="font-medium">{testConnectionMutation.data.message}</p>
                {testConnectionMutation.data.data && (
                  <p className="text-sm mt-1">
                    User ID: {testConnectionMutation.data.data.user_id}
                  </p>
                )}
                {testConnectionMutation.data.error && (
                  <p className="text-sm mt-1">{testConnectionMutation.data.error}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
