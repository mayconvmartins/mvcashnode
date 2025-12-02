import { useQuery } from '@tanstack/react-query'
import { monitoringService } from '@/lib/api/monitoring.service'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

export function useMonitoringAlerts() {
    const previousAlertsRef = useRef<Set<number>>(new Set())

    const { data: alerts, isLoading } = useQuery({
        queryKey: ['monitoring', 'alerts'],
        queryFn: () => monitoringService.getAlerts(),
        refetchInterval: 30000, // Verificar a cada 30 segundos
    })

    useEffect(() => {
        if (!alerts) return

        const currentAlertIds = new Set(alerts.map(alert => alert.id))
        const previousAlertIds = previousAlertsRef.current

        // Verificar novos alertas
        alerts.forEach(alert => {
            if (!previousAlertIds.has(alert.id)) {
                // Novo alerta detectado
                const severityEmoji = {
                    critical: '🚨',
                    high: '⚠️',
                    medium: '📢',
                    low: 'ℹ️',
                }[alert.severity] || '📢'

                const message = `${severityEmoji} ${alert.message}`

                switch (alert.severity) {
                    case 'critical':
                        toast.error(message, {
                            duration: 10000,
                            description: alert.service_name ? `Serviço: ${alert.service_name}` : undefined,
                        })
                        break
                    case 'high':
                        toast.warning(message, {
                            duration: 8000,
                            description: alert.service_name ? `Serviço: ${alert.service_name}` : undefined,
                        })
                        break
                    case 'medium':
                        toast.info(message, {
                            duration: 5000,
                            description: alert.service_name ? `Serviço: ${alert.service_name}` : undefined,
                        })
                        break
                    default:
                        toast(message, {
                            duration: 3000,
                            description: alert.service_name ? `Serviço: ${alert.service_name}` : undefined,
                        })
                }
            }
        })

        previousAlertsRef.current = currentAlertIds
    }, [alerts])

    return {
        alerts: alerts || [],
        isLoading,
        criticalCount: alerts?.filter(a => a.severity === 'critical').length || 0,
        highCount: alerts?.filter(a => a.severity === 'high').length || 0,
        mediumCount: alerts?.filter(a => a.severity === 'medium').length || 0,
        lowCount: alerts?.filter(a => a.severity === 'low').length || 0,
        totalCount: alerts?.length || 0,
    }
}

