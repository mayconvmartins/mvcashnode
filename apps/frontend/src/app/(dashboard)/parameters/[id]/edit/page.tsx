'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { tradeParametersService } from '@/lib/api/trade-parameters.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import { ParameterWizard } from '@/components/parameters/ParameterWizard'

export default function EditParameterPage() {
    const params = useParams()
    const router = useRouter()
    const parameterId = params.id as string

    const { data: parameter, isLoading } = useQuery({
        queryKey: ['trade-parameter', parameterId],
        queryFn: () => tradeParametersService.getById(parameterId),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[600px]" />
            </div>
        )
    }

    if (!parameter) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Parâmetro não encontrado</h2>
                <Button onClick={() => router.push('/parameters')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Parâmetros
                </Button>
            </div>
        )
    }

    // Mapear dados do backend para o formato esperado pelo wizard
    const mappedParameter = {
        ...parameter,
        id: parameter.id,
        account: parameter.exchange_account || parameter.account,
        accountId: parameter.exchange_account_id?.toString() || parameter.exchange_account?.id?.toString(),
        symbol: parameter.symbol,
        side: parameter.side,
        orderSizeType: parameter.quote_amount_fixed ? 'FIXED' : 'PERCENT',
        orderSizeValue: parameter.quote_amount_fixed || parameter.quote_amount_pct_balance || 0,
        stopLossPercent: parameter.default_sl_pct,
        takeProfitPercent: parameter.default_tp_pct,
        trailingStop: parameter.trailing_stop_enabled || false,
        maxDailyTrades: parameter.max_orders_per_hour, // Ajustar se necessário
        maxWeeklyTrades: undefined, // Não existe no schema
        vaultId: parameter.vault_id?.toString() || parameter.vault?.id?.toString(),
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/parameters')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">Editar Parâmetro</h1>
                    <p className="text-muted-foreground">
                        {parameter.exchange_account?.label || 'Conta'} • {parameter.symbol} • {parameter.side}
                    </p>
                </div>
            </div>

            {/* Wizard */}
            <Card>
                <CardHeader>
                    <CardTitle>Assistente de Edição</CardTitle>
                    <CardDescription>
                        Atualize as configurações do parâmetro
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ParameterWizard 
                        parameter={mappedParameter}
                        onSuccess={() => {
                            router.push('/parameters')
                        }}
                        onCancel={() => router.push('/parameters')}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

