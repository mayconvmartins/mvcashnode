'use client'

import { useQuery } from '@tanstack/react-query'
import { webhookMonitorService, type AlertTimeline } from '@/lib/api/webhook-monitor.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Clock,
  DollarSign,
  Target,
  AlertCircle,
  RefreshCcw
} from 'lucide-react'

interface WebhookMonitorTimelineProps {
  alertId: number
}

export function WebhookMonitorTimeline({ alertId }: WebhookMonitorTimelineProps) {
  const { data: timeline, isLoading, error } = useQuery({
    queryKey: ['webhook-monitor-timeline', alertId],
    queryFn: () => webhookMonitorService.getAlertTimeline(alertId),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !timeline || !timeline.alert) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            <AlertCircle className="mx-auto h-8 w-8 mb-2" />
            <p>Erro ao carregar timeline do alerta</p>
            {error && <p className="text-sm mt-2">{String(error)}</p>}
          </div>
        </CardContent>
      </Card>
    )
  }

  const { alert, snapshots = [], summary } = timeline
  
  // Valores seguros com fallback
  const priceAlert = Number(alert.price_alert) || 0
  const priceMinimum = alert.price_minimum ? Number(alert.price_minimum) : null
  const priceMaximum = alert.price_maximum ? Number(alert.price_maximum) : null
  const executionPrice = alert.execution_price ? Number(alert.execution_price) : null
  const savingsPct = alert.savings_pct !== null && alert.savings_pct !== undefined ? Number(alert.savings_pct) : null

  return (
    <div className="space-y-6">
      {/* Header - Informações do Alerta */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{alert.symbol}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Alerta #{alert.id} - {alert.side === 'BUY' ? 'Compra' : 'Venda'}
              </p>
            </div>
            <Badge 
              variant={
                alert.state === 'EXECUTED' ? 'default' :
                alert.state === 'CANCELLED' ? 'destructive' :
                'secondary'
              }
            >
              {alert.state === 'EXECUTED' ? 'Executado' :
               alert.state === 'CANCELLED' ? 'Cancelado' :
               'Monitorando'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Preço Alerta</p>
              <p className="font-mono font-semibold">${priceAlert.toFixed(8)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {alert.side === 'BUY' ? 'Preço Mínimo' : 'Preço Máximo'}
              </p>
              <p className="font-mono font-semibold">
                {alert.side === 'BUY' 
                  ? (priceMinimum !== null ? `$${priceMinimum.toFixed(8)}` : '-')
                  : (priceMaximum !== null ? `$${priceMaximum.toFixed(8)}` : '-')
                }
              </p>
            </div>
            {executionPrice !== null && (
              <div>
                <p className="text-sm text-muted-foreground">Preço Execução</p>
                <p className="font-mono font-semibold">${executionPrice.toFixed(8)}</p>
              </div>
            )}
            {savingsPct !== null && (
              <div>
                <p className="text-sm text-muted-foreground">Economia</p>
                <p className={`font-mono font-semibold ${savingsPct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {savingsPct > 0 ? '+' : ''}{savingsPct.toFixed(2)}%
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duração Total</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalDuration || 0} min</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Range de Preço</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-mono">
              {summary?.priceRange?.min > 0 && summary?.priceRange?.max > 0
                ? `$${summary.priceRange.min.toFixed(4)} - $${summary.priceRange.max.toFixed(4)}`
                : '-'
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ciclos por Status</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 text-sm">
              <div className="flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-500" />
                <span>{summary?.cyclesByStatus?.FALLING || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <Minus className="h-3 w-3 text-yellow-500" />
                <span>{summary?.cyclesByStatus?.LATERAL || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span>{summary?.cyclesByStatus?.RISING || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline de Eventos */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline de Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto h-8 w-8 mb-3 text-muted-foreground" />
              <p className="text-muted-foreground font-medium mb-2">Nenhum snapshot registrado para este alerta</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Este alerta foi criado antes da implementação do sistema de timeline.
                Novos alertas terão histórico completo de monitoramento com detalhes de cada verificação de preço.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {snapshots.map((snapshot, index) => (
                <div key={snapshot.id} className="relative">
                  {/* Linha vertical */}
                  {index < snapshots.length - 1 && (
                    <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border" />
                  )}
                  
                  <div className="flex gap-4">
                    {/* Ícone do evento */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center z-10">
                      {getEventIcon(snapshot.event_type)}
                    </div>

                    {/* Conteúdo do evento */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <span className="font-semibold">{getEventLabel(snapshot.event_type)}</span>
                          {snapshot.monitoring_status && (
                            <Badge variant="outline" className="ml-2">
                              {getStatusLabel(snapshot.monitoring_status)}
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(snapshot.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>

                      <div className="text-sm text-muted-foreground space-y-1">
                        {snapshot.current_price && snapshot.current_price > 0 && (
                          <div>Preço: <span className="font-mono">${Number(snapshot.current_price).toFixed(8)}</span></div>
                        )}
                        
                        {alert.side === 'BUY' && snapshot.cycles_without_new_low !== null && snapshot.cycles_without_new_low !== undefined && (
                          <div>Ciclos sem novo fundo: {snapshot.cycles_without_new_low}</div>
                        )}
                        
                        {alert.side === 'SELL' && snapshot.cycles_without_new_high !== null && snapshot.cycles_without_new_high !== undefined && (
                          <div>Ciclos sem novo topo: {snapshot.cycles_without_new_high}</div>
                        )}

                        {snapshot.details && typeof snapshot.details === 'object' && Object.keys(snapshot.details).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
                              Ver detalhes técnicos
                            </summary>
                            <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                              {JSON.stringify(snapshot.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case 'CREATED':
      return <Clock className="h-4 w-4 text-blue-500" />
    case 'PRICE_CHECK':
    case 'STATUS_CHANGE':
      return <Target className="h-4 w-4 text-gray-500" />
    case 'REPLACED':
      return <RefreshCcw className="h-4 w-4 text-orange-500" />
    case 'EXECUTED':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'CANCELLED':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Clock className="h-4 w-4 text-gray-500" />
  }
}

function getEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    CREATED: 'Alerta Criado',
    PRICE_CHECK: 'Verificação de Preço',
    STATUS_CHANGE: 'Mudança de Status',
    REPLACED: 'Substituído',
    EXECUTED: 'Executado',
    CANCELLED: 'Cancelado',
  }
  return labels[eventType] || eventType
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    FALLING: 'Em Queda',
    LATERAL: 'Lateral',
    RISING: 'Em Alta',
  }
  return labels[status] || status
}

