'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { formatPercentage } from '@/lib/utils/format'
import type { Position } from '@/lib/types'

interface TSGMonitorCardProps {
  position: Position
  currentPnlPct: number
}

export function TSGMonitorCard({ position, currentPnlPct }: TSGMonitorCardProps) {
  if (!position.tsg_enabled) return null

  const activationPct = position.tsg_activation_pct || 0
  const dropPct = position.tsg_drop_pct || 0
  const maxPnlPct = position.tsg_max_pnl_pct || 0
  const isActivated = position.tsg_activated
  const isTriggered = position.tsg_triggered

  // Calcular próximo ponto fixo (incrementos de 0.5%)
  const nextMilestone = isActivated 
    ? Math.ceil((maxPnlPct || activationPct) / 0.5) * 0.5 
    : activationPct

  // Calcular threshold de venda
  const sellThreshold = isActivated && maxPnlPct > 0 ? maxPnlPct - dropPct : 0

  // Progresso até ativação (se não ativado ainda)
  const activationProgress = !isActivated && activationPct > 0
    ? Math.min((currentPnlPct / activationPct) * 100, 100)
    : 100

  // Progresso até próximo milestone
  const milestoneProgress = isActivated && maxPnlPct > 0
    ? Math.min(Math.max(((currentPnlPct - maxPnlPct) / 0.5) * 100, 0), 100)
    : 0

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="text-lg">🎯 Trailing Stop Gain</span>
          {isTriggered && (
            <Badge variant="default" className="bg-green-500">Executado</Badge>
          )}
          {!isTriggered && isActivated && (
            <Badge variant="default" className="bg-amber-500">Rastreando</Badge>
          )}
          {!isActivated && (
            <Badge variant="outline">Aguardando Ativação</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ativação */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Ativação</span>
            <span className="font-medium">{formatPercentage(activationPct)}</span>
          </div>
          {!isActivated && (
            <>
              <Progress value={activationProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Atual: {formatPercentage(currentPnlPct)} - Faltam {formatPercentage(Math.max(0, activationPct - currentPnlPct))}
              </p>
            </>
          )}
        </div>

        {isActivated && (
          <>
            {/* Pico Máximo */}
            <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200 dark:border-green-800">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  📈 Pico Máximo Atingido
                </span>
                <span className="text-lg font-bold text-green-700 dark:text-green-400">
                  {formatPercentage(maxPnlPct)}
                </span>
              </div>
            </div>

            {/* Lucro Atual vs Pico */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Lucro Atual</span>
                <span className={`font-medium ${currentPnlPct < sellThreshold ? 'text-red-500' : 'text-green-500'}`}>
                  {formatPercentage(currentPnlPct)}
                </span>
              </div>
              <div className="relative">
                <Progress 
                  value={maxPnlPct > 0 ? Math.min((currentPnlPct / maxPnlPct) * 100, 100) : 0} 
                  className={`h-3 ${currentPnlPct < sellThreshold ? 'bg-red-100' : ''}`}
                />
                {/* Indicador de threshold de venda */}
                {maxPnlPct > 0 && sellThreshold > 0 && (
                  <div 
                    className="absolute top-0 h-3 w-0.5 bg-red-500"
                    style={{ left: `${Math.min((sellThreshold / maxPnlPct) * 100, 100)}%` }}
                    title={`Vende em ${formatPercentage(sellThreshold)}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Vende se cair para: {formatPercentage(sellThreshold)}</span>
                <span>Queda: {formatPercentage(dropPct)}</span>
              </div>
            </div>

            {/* Próximo Marco */}
            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  🎯 Próximo Marco
                </span>
                <span className="font-bold text-blue-700 dark:text-blue-400">
                  {formatPercentage(nextMilestone)}
                </span>
              </div>
              <Progress 
                value={Math.min(Math.max(milestoneProgress, 0), 100)} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Faltam {formatPercentage(Math.max(0, nextMilestone - currentPnlPct))} para próximo nível
              </p>
            </div>
          </>
        )}

        {/* Configuração */}
        <div className="text-xs text-muted-foreground border-t pt-3">
          <div className="flex justify-between">
            <span>% de Queda:</span>
            <span className="font-medium">{formatPercentage(dropPct)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

