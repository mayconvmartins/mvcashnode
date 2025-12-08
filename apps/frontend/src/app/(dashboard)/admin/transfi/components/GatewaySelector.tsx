'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/lib/api/admin.service';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function GatewaySelector() {
  const queryClient = useQueryClient();

  const { data: gatewayConfig, isLoading } = useQuery({
    queryKey: ['admin', 'payment-gateway'],
    queryFn: () => adminService.getPaymentGateway(),
  });

  const updateMutation = useMutation({
    mutationFn: (gateway: 'mercadopago' | 'transfi') => 
      adminService.setPaymentGateway(gateway),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-gateway'] });
      toast.success('Gateway de pagamento atualizado!');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao atualizar gateway');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Gateway Padrão</Label>
      <Select
        value={gatewayConfig?.gateway || 'mercadopago'}
        onValueChange={(value) => {
          updateMutation.mutate(value as 'mercadopago' | 'transfi');
        }}
        disabled={updateMutation.isPending}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mercadopago">Mercado Pago</SelectItem>
          <SelectItem value="transfi">TransFi</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Selecione qual gateway de pagamento será usado por padrão para novas assinaturas.
        Esta configuração pode ser alterada a qualquer momento.
      </p>
      {updateMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Atualizando...</span>
        </div>
      )}
    </div>
  );
}
