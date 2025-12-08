'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

interface SubscriberParametersFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriberParametersForm({ open, onOpenChange }: SubscriberParametersFormProps) {
  const queryClient = useQueryClient();
  
  const { data: subscribers } = useQuery({
    queryKey: ['admin', 'subscribers'],
    queryFn: () => adminService.listSubscribers(),
    enabled: open,
  });

  const [formData, setFormData] = useState({
    user_id: null as number | null,
    default_exchange_account_id: undefined as number | undefined,
    max_orders_per_hour: undefined as number | undefined,
    min_interval_sec: undefined as number | undefined,
    default_order_type: 'MARKET' as string,
    slippage_bps: 0,
    default_sl_enabled: false,
    default_sl_pct: undefined as number | undefined,
    default_tp_enabled: false,
    default_tp_pct: undefined as number | undefined,
    trailing_stop_enabled: false,
    trailing_distance_pct: undefined as number | undefined,
    min_profit_pct: undefined as number | undefined,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => adminService.createSubscriberParameters(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriber-parameters'] });
      toast.success('Parâmetros criados com sucesso!');
      onOpenChange(false);
      // Reset form
      setFormData({
        user_id: null,
        default_exchange_account_id: undefined,
        max_orders_per_hour: undefined,
        min_interval_sec: undefined,
        default_order_type: 'MARKET',
        slippage_bps: 0,
        default_sl_enabled: false,
        default_sl_pct: undefined,
        default_tp_enabled: false,
        default_tp_pct: undefined,
        trailing_stop_enabled: false,
        trailing_distance_pct: undefined,
        min_profit_pct: undefined,
      });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao criar parâmetros');
    },
  });

  const handleSubmit = () => {
    if (!formData.user_id) {
      toast.error('Selecione um usuário assinante');
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Parâmetros de Assinante</DialogTitle>
          <DialogDescription>
            Configure os parâmetros padrão para um assinante específico
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Usuário Assinante *</Label>
            <Select
              value={formData.user_id?.toString() || ''}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, user_id: value ? parseInt(value) : null }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um assinante" />
              </SelectTrigger>
              <SelectContent>
                {subscribers && subscribers.length > 0 ? (
                  subscribers.map((user: any) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.profile?.full_name || user.email} ({user.email})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    Nenhum assinante encontrado
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Conta de Exchange Padrão</Label>
              <Input
                type="number"
                placeholder="ID da conta"
                value={formData.default_exchange_account_id || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    default_exchange_account_id: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Ordem Padrão</Label>
              <Select
                value={formData.default_order_type}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, default_order_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKET">Market</SelectItem>
                  <SelectItem value="LIMIT">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Máx. Ordens por Hora</Label>
              <Input
                type="number"
                placeholder="Ex: 10"
                value={formData.max_orders_per_hour || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    max_orders_per_hour: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Intervalo Mínimo (segundos)</Label>
              <Input
                type="number"
                placeholder="Ex: 60"
                value={formData.min_interval_sec || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    min_interval_sec: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Slippage (bps)</Label>
              <Input
                type="number"
                placeholder="0"
                value={formData.slippage_bps}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    slippage_bps: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Lucro Mínimo (%)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Ex: 0.5"
                value={formData.min_profit_pct || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    min_profit_pct: e.target.value ? parseFloat(e.target.value) : undefined,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Stop Loss Padrão</h3>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.default_sl_enabled}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, default_sl_enabled: checked }))}
              />
              <Label>Habilitar Stop Loss Padrão</Label>
            </div>
            {formData.default_sl_enabled && (
              <div className="space-y-2">
                <Label>Stop Loss (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 2.0"
                  value={formData.default_sl_pct || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      default_sl_pct: e.target.value ? parseFloat(e.target.value) : undefined,
                    }))
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Take Profit Padrão</h3>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.default_tp_enabled}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, default_tp_enabled: checked }))}
              />
              <Label>Habilitar Take Profit Padrão</Label>
            </div>
            {formData.default_tp_enabled && (
              <div className="space-y-2">
                <Label>Take Profit (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 3.0"
                  value={formData.default_tp_pct || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      default_tp_pct: e.target.value ? parseFloat(e.target.value) : undefined,
                    }))
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Trailing Stop</h3>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.trailing_stop_enabled}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, trailing_stop_enabled: checked }))}
              />
              <Label>Habilitar Trailing Stop</Label>
            </div>
            {formData.trailing_stop_enabled && (
              <div className="space-y-2">
                <Label>Distância Trailing (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 1.0"
                  value={formData.trailing_distance_pct || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      trailing_distance_pct: e.target.value ? parseFloat(e.target.value) : undefined,
                    }))
                  }
                />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Criando...
              </>
            ) : (
              'Criar Parâmetros'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
