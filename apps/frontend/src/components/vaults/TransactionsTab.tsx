'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { vaultsService } from '@/lib/api/vaults.service'
import { formatDateTime } from '@/lib/utils/format'

interface TransactionsTabProps {
    vaultId: number
}

export function TransactionsTab({ vaultId }: TransactionsTabProps) {
    const { data: transactions, isLoading } = useQuery({
        queryKey: ['vault-transactions', vaultId],
        queryFn: async () => {
            const response = await vaultsService.getTransactions(vaultId)
            return response.data
        },
    })

    const columns: Column<any>[] = [
        {
            key: 'type',
            label: 'Tipo',
            render: (tx) => (
                <Badge variant={tx.type === 'DEPOSIT' ? 'success' : 'destructive'}>
                    {tx.type}
                </Badge>
            ),
        },
        {
            key: 'asset',
            label: 'Asset',
            render: (tx) => <span className="font-mono">{tx.asset}</span>,
        },
        {
            key: 'amount',
            label: 'Quantidade',
            render: (tx) => <span className="font-mono">{tx.amount?.toFixed(8)}</span>,
        },
        {
            key: 'description',
            label: 'Descrição',
            render: (tx) => <span className="text-sm">{tx.description || '-'}</span>,
        },
        {
            key: 'created_at',
            label: 'Data',
            render: (tx) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(tx.created_at)}</span>
            ),
        },
    ]

    return (
        <Card className="glass">
            <CardHeader>
                <CardTitle>Histórico de Transações</CardTitle>
            </CardHeader>
            <CardContent>
                <DataTable
                    data={transactions || []}
                    columns={columns}
                    loading={isLoading}
                    emptyState={
                        <div className="text-center py-8">
                            <p className="text-muted-foreground">Nenhuma transação encontrada</p>
                        </div>
                    }
                />
            </CardContent>
        </Card>
    )
}

