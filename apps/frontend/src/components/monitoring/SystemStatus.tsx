'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, Database, Server, Cpu, MemoryStick } from 'lucide-react'
import type { SystemStatus as SystemStatusType } from '@/lib/api/monitoring.service'

interface SystemStatusProps {
    status: SystemStatusType
}

export function SystemStatus({ status }: SystemStatusProps) {
    const getStatusColor = (st: string) => {
        switch (st) {
            case 'healthy':
            case 'running':
                return 'bg-green-500'
            case 'degraded':
                return 'bg-yellow-500'
            case 'down':
            case 'error':
                return 'bg-red-500'
            default:
                return 'bg-gray-500'
        }
    }

    const formatBytes = (bytes: number) => {
        if (!bytes || bytes === 0) return 'N/A'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
    }

    const serviceNames: Record<string, string> = {
        api: 'API',
        executor: 'Executor',
        monitors: 'Monitors',
        frontend: 'Frontend',
        site: 'Site',
        backup: 'Backup',
    }

    const services = Object.entries(status.services).filter(([_, service]) => service !== undefined)

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Services Cards */}
            {services.map(([key, service]) => {
                if (!service) return null
                const displayName = serviceNames[key] || key.toUpperCase()
                const isCluster = service.exec_mode === 'cluster' && (service.instances || 0) > 1

                return (
                    <Card key={key}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{displayName}</CardTitle>
                            <Server className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center space-x-2">
                                <div className={`h-3 w-3 rounded-full ${getStatusColor(service.status)}`} />
                                <span className="text-xs capitalize">{service.status}</span>
                                {isCluster && (
                                    <Badge variant="outline" className="ml-1 text-xs">
                                        {service.instances}x
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                CPU: {service.cpu > 0 ? service.cpu.toFixed(2) + '%' : 'Aguardando...'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Mem: {formatBytes(service.memory)}
                            </p>
                            {isCluster && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Modo: Cluster ({service.instances} instâncias)
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )
            })}

            {/* Database */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Database</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2">
                        <div className={`h-3 w-3 rounded-full ${getStatusColor(status.resources.database.status)}`} />
                        <span className="text-xs capitalize">{status.resources.database.status}</span>
                    </div>
                    {status.resources.database.responseTime && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Response: {status.resources.database.responseTime}ms
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* System CPU */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">System CPU</CardTitle>
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{status.system.cpu.usage.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">
                        {status.system.cpu.cores} cores @ {status.system.cpu.speed} GHz
                    </p>
                </CardContent>
            </Card>

            {/* System Memory */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">System Memory</CardTitle>
                    <MemoryStick className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{status.system.memory.usagePercent.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">
                        {formatBytes(status.system.memory.used)} / {formatBytes(status.system.memory.total)}
                    </p>
                </CardContent>
            </Card>

            {/* Alerts Summary */}
            <Card className="md:col-span-2 lg:col-span-4">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex space-x-4">
                        <Badge variant="destructive">Critical: {status.alerts.critical}</Badge>
                        <Badge variant="default" className="bg-orange-500">High: {status.alerts.high}</Badge>
                        <Badge variant="default" className="bg-yellow-500">Medium: {status.alerts.medium}</Badge>
                        <Badge variant="secondary">Low: {status.alerts.low}</Badge>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

