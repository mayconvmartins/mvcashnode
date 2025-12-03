'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Minus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Dialog } from '@/components/ui/dialog'
import { DepositModal } from './DepositModal'
import { WithdrawModal } from './WithdrawModal'
import { vaultsService } from '@/lib/api/vaults.service'
import { formatCurrency } from '@/lib/utils/format'

interface BalancesTabProps {
    vaultId: number
}

export function BalancesTab({ vaultId }: BalancesTabProps) {
    const [isDepositOpen, setIsDepositOpen] = useState(false)
    const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)
    const [selectedAsset, setSelectedAsset] = useState<string>('')

    const { data: balances, isLoading } = useQuery({
        queryKey: ['vault-balances', vaultId],
        queryFn: () => vaultsService.getBalances(vaultId),
    })

    const handleDeposit = (asset: string) => {
        setSelectedAsset(asset)
        setIsDepositOpen(true)
    }

    const handleWithdraw = (asset: string) => {
        setSelectedAsset(asset)
        setIsWithdrawOpen(true)
    }

    const columns: Column<any>[] = [
        {
            key: 'asset',
            label: 'Asset',
            render: (balance) => <span className="font-mono font-medium">{balance.asset}</span>,
        },
        {
            key: 'available',
            label: 'Disponível',
            render: (balance) => <span className="font-mono">{balance.available?.toFixed(8)}</span>,
        },
        {
            key: 'locked',
            label: 'Bloqueado',
            render: (balance) => <span className="font-mono">{balance.locked?.toFixed(8) || '0.00000000'}</span>,
        },
        {
            key: 'total',
            label: 'Total',
            render: (balance) => (
                <span className="font-mono font-medium">
                    {((balance.available || 0) + (balance.locked || 0)).toFixed(8)}
                </span>
            ),
        },
        {
            key: 'usd_value',
            label: 'Valor USD',
            render: (balance) => (
                <span className="font-mono">{formatCurrency(balance.usd_value || 0)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (balance) => (
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleDeposit(balance.asset)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Depositar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleWithdraw(balance.asset)}>
                        <Minus className="h-4 w-4 mr-1" />
                        Sacar
                    </Button>
                </div>
            ),
        },
    ]

    return (
        <>
            <Card className="glass">
                <CardHeader>
                    <CardTitle>Saldos por Asset</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={balances || []}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-8">
                                <p className="text-muted-foreground">Nenhum saldo encontrado</p>
                            </div>
                        }
                    />
                </CardContent>
            </Card>

            <DepositModal
                vaultId={vaultId}
                asset={selectedAsset}
                isOpen={isDepositOpen}
                onClose={() => setIsDepositOpen(false)}
            />
            <WithdrawModal
                vaultId={vaultId}
                asset={selectedAsset}
                isOpen={isWithdrawOpen}
                onClose={() => setIsWithdrawOpen(false)}
            />
        </>
    )
}

