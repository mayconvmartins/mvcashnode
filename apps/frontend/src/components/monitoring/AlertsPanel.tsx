'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle } from 'lucide-react'
import type { SystemAlert } from '@/lib/api/monitoring.service'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface AlertsPanelProps {
    alerts: SystemAlert[]
    onResolve: (alertId: number) => void
}

export function AlertsPanel({ alerts, onResolve }: AlertsPanelProps) {
    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'critical':
                return <Badge variant="destructive">Critical</Badge>
            case 'high':
                return <Badge variant="default" className="bg-orange-500">High</Badge>
            case 'medium':
                return <Badge variant="default" className="bg-yellow-500">Medium</Badge>
            case 'low':
                return <Badge variant="secondary">Low</Badge>
            default:
                return <Badge variant="secondary">{severity}</Badge>
        }
    }

    const getAlertIcon = (severity: string) => {
        const baseClass = "h-5 w-5"
        switch (severity) {
            case 'critical':
            case 'high':
                return <AlertCircle className={`${baseClass} text-red-500`} />
            case 'medium':
                return <AlertCircle className={`${baseClass} text-yellow-500`} />
            default:
                return <AlertCircle className={`${baseClass} text-blue-500`} />
        }
    }

    if (alerts.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                        <p className="text-sm text-muted-foreground">Nenhum alerta ativo</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Alerts ({alerts.length})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {alerts.map((alert) => (
                        <div key={alert.id} className="flex items-start space-x-3 border-b pb-4 last:border-0">
                            {getAlertIcon(alert.severity)}
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center space-x-2">
                                    {getSeverityBadge(alert.severity)}
                                    {alert.service_name && (
                                        <Badge variant="outline">{alert.service_name}</Badge>
                                    )}
                                </div>
                                <p className="text-sm font-medium">{alert.message}</p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(alert.created_at), { 
                                        addSuffix: true,
                                        locale: ptBR 
                                    })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Tipo: {alert.alert_type}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onResolve(alert.id)}
                            >
                                Resolver
                            </Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

