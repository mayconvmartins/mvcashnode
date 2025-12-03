'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { operationsService } from '@/lib/api/operations.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { formatDateTime } from '@/lib/utils/format'
import { Eye } from 'lucide-react'

export default function OperationsPage() {
    const { tradeMode } = useTradeMode()
    const router = useRouter()

    const { data: operationsResponse, isLoading } = useQuery({
        queryKey: ['operations', tradeMode],
        queryFn: () => operationsService.list({ trade_mode: tradeMode }),
    })

    const operations = operationsResponse?.data || []

    const columns: Column<any>[] = [
        { 
            key: 'id', 
            label: 'ID', 
            render: (op) => <span className="font-mono">#{op.job.id}</span> 
        },
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (op) => <span className="font-mono">{op.job.symbol}</span>
        },
        {
            key: 'side',
            label: 'Lado',
            render: (op) => (
                <Badge variant={op.job.side === 'BUY' ? 'success' : 'destructive'}>
                    {op.job.side}
                </Badge>
            ),
        },
        {
            key: 'status',
            label: 'Status',
            render: (op) => {
                const variant =
                    op.job.status === 'FILLED'
                        ? 'success'
                        : op.job.status === 'FAILED'
                        ? 'destructive'
                        : 'secondary'
                return <Badge variant={variant}>{op.job.status}</Badge>
            },
        },
        {
            key: 'order_type',
            label: 'Tipo',
            render: (op) => <Badge variant="outline">{op.job.order_type}</Badge>,
        },
        {
            key: 'executions',
            label: 'Execuções',
            render: (op) => <span>{op.executions.length}</span>
        },
        { 
            key: 'created_at', 
            label: 'Criado em', 
            render: (op) => <span className="text-sm">{formatDateTime(op.job.created_at)}</span> 
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (op) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/operations/${op.job.id}`)}
                >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Detalhes
                </Button>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Operações</h1>
                    <p className="text-muted-foreground mt-1">Visualize jobs e execuções de trading</p>
                </div>
                <ModeToggle />
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todas as Operações - {tradeMode}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={operations}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">Nenhuma operação encontrada</p>
                            </div>
                        }
                    />
                    {operationsResponse?.pagination && (
                        <div className="mt-4 text-sm text-muted-foreground text-center">
                            Página {operationsResponse.pagination.current_page} de {operationsResponse.pagination.total_pages} 
                            {' '}({operationsResponse.pagination.total_items} total)
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}


