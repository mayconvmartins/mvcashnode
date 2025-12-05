'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { monitoringService } from '@/lib/api/monitoring.service'
import { SystemStatus } from '@/components/monitoring/SystemStatus'
import { ProcessesList } from '@/components/monitoring/ProcessesList'
import { AlertsPanel } from '@/components/monitoring/AlertsPanel'
import { JobsList } from '@/components/monitoring/JobsList'
import { ExecutionLogs } from '@/components/monitoring/ExecutionLogs'
import { CronJobsManager } from '@/components/monitoring/CronJobsManager'
import { BackendLogs } from '@/components/monitoring/BackendLogs'
import { CleanupOrphanedPositions } from '@/components/monitoring/CleanupOrphanedPositions'
import { SyncExecutionFees } from '@/components/monitoring/SyncExecutionFees'
import { AuditPositions } from '@/components/monitoring/AuditPositions'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, Activity, Clock, History, AlertTriangle, FileCode } from 'lucide-react'
import { toast } from 'sonner'

export default function MonitoringPage() {
    const [autoRefresh, setAutoRefresh] = useState(true)

    // Query para status do sistema
    const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
        queryKey: ['monitoring', 'status'],
        queryFn: () => monitoringService.getStatus(),
        refetchInterval: autoRefresh ? 10000 : false, // Auto-refresh a cada 10 segundos
    })

    // Query para processos
    const { data: processes, refetch: refetchProcesses } = useQuery({
        queryKey: ['monitoring', 'processes'],
        queryFn: () => monitoringService.getProcesses(),
        refetchInterval: autoRefresh ? 10000 : false,
    })

    // Query para alertas
    const { data: alerts, refetch: refetchAlerts } = useQuery({
        queryKey: ['monitoring', 'alerts'],
        queryFn: () => monitoringService.getAlerts(),
        refetchInterval: autoRefresh ? 10000 : false,
    })

    // Query para jobs
    const { data: jobs, refetch: refetchJobs } = useQuery({
        queryKey: ['monitoring', 'jobs'],
        queryFn: () => monitoringService.getJobs(),
        refetchInterval: autoRefresh ? 10000 : false,
    })

    // Query para logs
    const { data: logs, refetch: refetchLogs } = useQuery({
        queryKey: ['monitoring', 'history'],
        queryFn: () => monitoringService.getHistory(undefined, 50),
        refetchInterval: autoRefresh ? 10000 : false,
    })

    const handleResolveAlert = async (alertId: number) => {
        try {
            await monitoringService.resolveAlert(alertId)
            toast.success('Alerta resolvido com sucesso')
            refetchAlerts()
            refetchStatus()
        } catch (error) {
            toast.error('Erro ao resolver alerta')
        }
    }

    const handleRefresh = () => {
        refetchStatus()
        refetchProcesses()
        refetchAlerts()
        refetchJobs()
        refetchLogs()
        toast.success('Dados atualizados')
    }

    if (statusLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
            </div>
        )
    }

    if (!status) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-muted-foreground">Não foi possível carregar dados de monitoramento</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Monitoramento do Sistema</h1>
                    <p className="text-muted-foreground">
                        Acompanhe o status de todos os serviços em tempo real
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        {autoRefresh ? 'Pausar' : 'Ativar'} Auto-refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Status Cards */}
            <SystemStatus status={status} />

            {/* Tabs de Conteúdo */}
            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="overview" className="flex items-center space-x-2">
                        <Activity className="h-4 w-4" />
                        <span>Visão Geral</span>
                    </TabsTrigger>
                    <TabsTrigger value="crons" className="flex items-center space-x-2">
                        <Clock className="h-4 w-4" />
                        <span>Jobs Agendados</span>
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="flex items-center space-x-2">
                        <History className="h-4 w-4" />
                        <span>Logs</span>
                    </TabsTrigger>
                    <TabsTrigger value="backend" className="flex items-center space-x-2">
                        <FileCode className="h-4 w-4" />
                        <span>Backend</span>
                    </TabsTrigger>
                    <TabsTrigger value="alerts" className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Alertas</span>
                        {alerts && alerts.length > 0 && (
                            <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                                {alerts.length}
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* Visão Geral */}
                <TabsContent value="overview" className="space-y-6">
                    {/* Jobs List */}
                    {jobs && jobs.length > 0 && <JobsList jobs={jobs} />}

                    {/* Admin Actions */}
                    <div className="grid gap-6 md:grid-cols-2">
                        <CleanupOrphanedPositions />
                        <SyncExecutionFees />
                    </div>
                    
                    {/* Audit Positions */}
                    <div className="grid gap-6">
                        <AuditPositions />
                    </div>

                    {/* Content Grid */}
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Processes List */}
                        {processes && <ProcessesList processes={processes} />}

                        {/* Alerts Panel */}
                        {alerts && (
                            <AlertsPanel alerts={alerts} onResolve={handleResolveAlert} />
                        )}
                    </div>
                </TabsContent>

                {/* Crons */}
                <TabsContent value="crons">
                    <CronJobsManager />
                </TabsContent>

                {/* Logs */}
                <TabsContent value="logs">
                    <ExecutionLogs logs={logs || []} autoRefresh={autoRefresh} />
                </TabsContent>

                {/* Backend Logs */}
                <TabsContent value="backend">
                    <BackendLogs autoRefresh={autoRefresh} />
                </TabsContent>

                {/* Alertas */}
                <TabsContent value="alerts">
                    {alerts && <AlertsPanel alerts={alerts} onResolve={handleResolveAlert} />}
                </TabsContent>
            </Tabs>
        </div>
    )
}

