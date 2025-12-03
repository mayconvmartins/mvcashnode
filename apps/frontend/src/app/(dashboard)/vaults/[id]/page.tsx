'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { BalancesTab } from '@/components/vaults/BalancesTab'
import { TransactionsTab } from '@/components/vaults/TransactionsTab'
import { vaultsService } from '@/lib/api/vaults.service'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'

export default function VaultDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const vaultId = parseInt(id)

    const { data: vault, isLoading } = useQuery({
        queryKey: ['vault', vaultId],
        queryFn: () => vaultsService.getOne(vaultId),
    })

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (!vault) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Cofre não encontrado</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/vaults">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                </Link>
            </div>

            <Card className="glass">
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle className="text-2xl">{vault.name}</CardTitle>
                            {vault.description && (
                                <p className="text-muted-foreground mt-1">{vault.description}</p>
                            )}
                        </div>
                        <Badge variant={vault.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                            {vault.trade_mode}
                        </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Saldo Total</p>
                            <p className="text-2xl font-bold font-mono">
                                N/A
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Criado em</p>
                            <p className="text-sm">{formatDateTime(vault.created_at)}</p>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue="balances" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="balances">Saldos por Asset</TabsTrigger>
                    <TabsTrigger value="transactions">Transações</TabsTrigger>
                    <TabsTrigger value="chart">Evolução</TabsTrigger>
                </TabsList>

                <TabsContent value="balances">
                    <BalancesTab vaultId={vaultId} />
                </TabsContent>

                <TabsContent value="transactions">
                    <TransactionsTab vaultId={vaultId} />
                </TabsContent>

                <TabsContent value="chart">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Evolução do Saldo</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                                Gráfico de evolução será implementado aqui (Recharts)
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

