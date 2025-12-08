'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

interface PaymentStatusProps {
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'in_process';
  statusDetail?: string;
}

export function PaymentStatus({ status, statusDetail }: PaymentStatusProps) {
  const statusConfig = {
    pending: {
      label: 'Pendente',
      variant: 'outline' as const,
      icon: Clock,
      color: 'text-yellow-500',
    },
    approved: {
      label: 'Aprovado',
      variant: 'default' as const,
      icon: CheckCircle,
      color: 'text-green-500',
    },
    rejected: {
      label: 'Rejeitado',
      variant: 'destructive' as const,
      icon: XCircle,
      color: 'text-red-500',
    },
    cancelled: {
      label: 'Cancelado',
      variant: 'secondary' as const,
      icon: XCircle,
      color: 'text-gray-500',
    },
    refunded: {
      label: 'Reembolsado',
      variant: 'secondary' as const,
      icon: XCircle,
      color: 'text-gray-500',
    },
    in_process: {
      label: 'Processando',
      variant: 'outline' as const,
      icon: Loader2,
      color: 'text-blue-500',
    },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-5 w-5 ${config.color} ${status === 'in_process' ? 'animate-spin' : ''}`} />
      <Badge variant={config.variant}>{config.label}</Badge>
      {statusDetail && (
        <span className="text-sm text-muted-foreground">({statusDetail})</span>
      )}
    </div>
  );
}
