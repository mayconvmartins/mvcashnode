'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { operationsService } from '@/lib/api/operations.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { formatDateTime } from '@/lib/utils/format'

export default function OperationsPage() {
    const { tradeMode } = useTradeMode()

    const { data: operations, isLoading } = useQuery({
        queryKey: ['operations', tradeMode],
        queryFn: () => operationsService.list({ trade_mode: tradeMode }),
    })

    const columns: Column<any>[] = [
        { key: 'id', label: 'ID', render: (op) => <span className="font-mono">#{op.id}</span> },
        {
            key: 'type',
            label: 'Tipo',
            render: (op) => <Badge variant="outline">{op.type}</Badge>,
        },
        {
            key: 'status',
            label: 'Status',
            render: (op) => {
                const variant =
                    op.status === 'FILLED'
                        ? 'success'
                        : op.status === 'FAILED'
                        ? 'destructive'
                        : 'secondary'
                return <Badge variant={variant}>{op.status}</Badge>
            },
        },
        { key: 'symbol', label: 'Símbolo', render: (op) => <span className="font-mono">{op.symbol}</span> },
        { key: 'created_at', label: 'Criado em', render: (op) => <span className="text-sm">{formatDateTime(op.created_at)}</span> },
        { key: 'processed_at', label: 'Processado em', render: (op) => op.processed_at ? <span className="text-sm">{formatDateTime(op.processed_at)}</span> : '-' },
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
                        data={operations || []}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">Nenhuma operação encontrada</p>
                            </div>
                        }
                    />
                </CardContent>
            </Card>
        </div>
    )
}

