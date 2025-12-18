'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SubscriberWebhooksPage() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    label: '',
    trade_mode: 'REAL' as 'REAL' | 'SIMULATION',
    require_signature: false,
    signing_secret: '',
    rate_limit_per_min: 60,
    allowed_ips: [] as string[],
  });

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['admin', 'subscriber-webhooks'],
    queryFn: () => adminService.listSubscriberWebhooks(),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => adminService.createSubscriberWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriber-webhooks'] });
      toast.success('Webhook padrão criado com sucesso!');
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao criar webhook padrão');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof formData }) =>
      adminService.updateSubscriberWebhook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriber-webhooks'] });
      toast.success('Webhook padrão atualizado com sucesso!');
      setIsEditOpen(false);
      setEditingId(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao atualizar webhook padrão');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminService.deleteSubscriberWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriber-webhooks'] });
      toast.success('Webhook padrão desativado com sucesso!');
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao desativar webhook padrão');
    },
  });

  const resetForm = () => {
    setFormData({
      label: '',
      trade_mode: 'REAL',
      require_signature: false,
      signing_secret: '',
      rate_limit_per_min: 60,
      allowed_ips: [],
    });
  };

  const handleEdit = (webhook: any) => {
    setEditingId(webhook.id);
    setFormData({
      label: webhook.label,
      trade_mode: webhook.trade_mode,
      require_signature: webhook.require_signature || false,
      signing_secret: '',
      rate_limit_per_min: webhook.rate_limit_per_min || 60,
      allowed_ips: Array.isArray(webhook.allowed_ips) ? webhook.allowed_ips : [],
    });
    setIsEditOpen(true);
  };

  const copyWebhookURL = (code: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const url = `${baseUrl}/webhooks/${code}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada para a área de transferência!');
  };

  const columns = [
    {
      key: 'label',
      label: 'Nome',
      render: (row: any) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.label}</span>
          <Badge variant="outline" className="text-xs">
            Padrão
          </Badge>
        </div>
      ),
    },
    {
      key: 'webhook_code',
      label: 'Código',
      render: (row: any) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{row.webhook_code}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyWebhookURL(row.webhook_code)}
            title="Copiar URL"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
    {
      key: 'trade_mode',
      label: 'Modo',
      render: (row: any) => (
        <Badge variant={row.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
          {row.trade_mode}
        </Badge>
      ),
    },
    {
      key: 'bindings_count',
      label: 'Contas Vinculadas',
      render: (row: any) => row.bindings_count || 0,
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (row: any) => (
        <Badge variant={row.is_active ? 'default' : 'outline'}>
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
            onClick={() => handleEdit(row)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteConfirmId(row.id)}
            disabled={!row.is_active}
          >
            <Trash2 className="h-4 w-4" />
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
          <h1 className="text-3xl font-bold">Webhooks Padrão</h1>
          <p className="text-muted-foreground">
            Gerencie webhooks que são automaticamente vinculados às contas de assinantes
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Criar Webhook Padrão
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Webhooks Padrão</CardTitle>
          <CardDescription>
            {webhooks?.length || 0} webhook(s) padrão configurado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable data={webhooks || []} columns={columns} />
        </CardContent>
      </Card>

      {/* Dialog de Criação */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Webhook Padrão</DialogTitle>
            <DialogDescription>
              Este webhook será automaticamente vinculado às contas de assinantes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Nome *</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Ex: Webhook Padrão Assinantes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade_mode">Modo de Trading *</Label>
              <Select
                value={formData.trade_mode}
                onValueChange={(value) => setFormData({ ...formData, trade_mode: value as 'REAL' | 'SIMULATION' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REAL">REAL</SelectItem>
                  <SelectItem value="SIMULATION">SIMULATION</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_limit_per_min">Rate Limit (por minuto)</Label>
              <Input
                id="rate_limit_per_min"
                type="number"
                value={formData.rate_limit_per_min}
                onChange={(e) => setFormData({ ...formData, rate_limit_per_min: parseInt(e.target.value) || 60 })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="require_signature"
                checked={formData.require_signature}
                onCheckedChange={(checked) => setFormData({ ...formData, require_signature: checked })}
              />
              <Label htmlFor="require_signature">Requer Assinatura HMAC</Label>
            </div>
            {formData.require_signature && (
              <div className="space-y-2">
                <Label htmlFor="signing_secret">Secret para Assinatura</Label>
                <Input
                  id="signing_secret"
                  type="password"
                  value={formData.signing_secret}
                  onChange={(e) => setFormData({ ...formData, signing_secret: e.target.value })}
                  placeholder="Secret para validar assinatura HMAC"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={createMutation.isPending || !formData.label}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Criando...
                </>
              ) : (
                'Criar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Webhook Padrão</DialogTitle>
            <DialogDescription>
              Atualize as configurações do webhook padrão
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_label">Nome *</Label>
              <Input
                id="edit_label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_rate_limit_per_min">Rate Limit (por minuto)</Label>
              <Input
                id="edit_rate_limit_per_min"
                type="number"
                value={formData.rate_limit_per_min}
                onChange={(e) => setFormData({ ...formData, rate_limit_per_min: parseInt(e.target.value) || 60 })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit_require_signature"
                checked={formData.require_signature}
                onCheckedChange={(checked) => setFormData({ ...formData, require_signature: checked })}
              />
              <Label htmlFor="edit_require_signature">Requer Assinatura HMAC</Label>
            </div>
            {formData.require_signature && (
              <div className="space-y-2">
                <Label htmlFor="edit_signing_secret">Secret para Assinatura</Label>
                <Input
                  id="edit_signing_secret"
                  type="password"
                  value={formData.signing_secret}
                  onChange={(e) => setFormData({ ...formData, signing_secret: e.target.value })}
                  placeholder="Deixe em branco para manter o secret atual"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editingId && updateMutation.mutate({ id: editingId, data: formData })}
              disabled={updateMutation.isPending || !formData.label}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Atualizando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar Webhook Padrão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja desativar este webhook padrão?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Desativando...
                </>
              ) : (
                'Desativar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

