'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { accountsService } from '@/lib/api/accounts.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils/format'

export default function AccountDetailPage() {
    const params = useParams()
    const router = useRouter()
    const accountId = params.id as string

    const { data: account, isLoading } = useQuery({
        queryKey: ['account', accountId],
        queryFn: () => accountsService.getById(accountId),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Conta não encontrada</h2>
                <Button onClick={() => router.push('/accounts')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Contas
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/accounts')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{account.name}</h1>
                        <p className="text-muted-foreground">{account.exchange}</p>
                    </div>
                </div>
                <Badge variant={account.active ? 'default' : 'secondary'}>
                    {account.active ? 'Ativa' : 'Inativa'}
                </Badge>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total de Trades</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{account.stats?.totalTrades || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>PnL Total</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${(account.stats?.totalPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatCurrency(account.stats?.totalPnL || 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Win Rate</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {account.stats?.winRate ? `${account.stats.winRate.toFixed(1)}%` : 'N/A'}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Último Uso</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm">
                            {account.lastUsedAt ? formatDate(account.lastUsedAt) : 'Nunca'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalhes da Conta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-mono">{account.id}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Exchange:</span>
                        <span>{account.exchange}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Modo:</span>
                        <span>{account.mode}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Criada em:</span>
                        <span>{formatDate(account.createdAt)}</span>
                    </div>
                    {account.description && (
                        <div className="pt-2">
                            <span className="text-muted-foreground block mb-1">Descrição:</span>
                            <p className="text-sm">{account.description}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Linked Parameters */}
            <Card>
                <CardHeader>
                    <CardTitle>Parâmetros Vinculados</CardTitle>
                    <CardDescription>
                        {account.parameters?.length || 0} parâmetro(s) usando esta conta
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {account.parameters && account.parameters.length > 0 ? (
                        <div className="space-y-2">
                            {account.parameters.map((param: any) => (
                                <div
                                    key={param.id}
                                    className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80"
                                    onClick={() => router.push(`/parameters`)}
                                >
                                    <div>
                                        <p className="font-medium">{param.symbol}</p>
                                        <p className="text-sm text-muted-foreground">{param.side}</p>
                                    </div>
                                    <Badge variant={param.active ? 'default' : 'secondary'}>
                                        {param.active ? 'Ativo' : 'Inativo'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            Nenhum parâmetro vinculado
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

