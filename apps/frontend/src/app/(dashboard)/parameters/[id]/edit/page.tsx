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
        account: (parameter as any).exchange_account || (parameter as any).account,
        accountId: parameter.exchange_account_id?.toString() || (parameter as any).exchange_account?.id?.toString(),
        symbol: parameter.symbol,
        side: parameter.side,
        orderSizeType: parameter.quote_amount_fixed ? 'FIXED' : (parameter.quote_amount_pct_balance ? 'PERCENT' : 'FIXED'),
        orderSizeValue: parameter.quote_amount_fixed 
            ? (typeof parameter.quote_amount_fixed === 'number' ? parameter.quote_amount_fixed : parseFloat(parameter.quote_amount_fixed))
            : (parameter.quote_amount_pct_balance 
                ? (typeof parameter.quote_amount_pct_balance === 'number' ? parameter.quote_amount_pct_balance : parseFloat(parameter.quote_amount_pct_balance))
                : 0),
        stopLossPercent: parameter.default_sl_pct 
            ? (typeof parameter.default_sl_pct === 'number' ? parameter.default_sl_pct : parseFloat(parameter.default_sl_pct))
            : undefined,
        takeProfitPercent: parameter.default_tp_pct 
            ? (typeof parameter.default_tp_pct === 'number' ? parameter.default_tp_pct : parseFloat(parameter.default_tp_pct))
            : undefined,
        stopGain: parameter.default_sg_enabled || false,
        stopGainPercent: parameter.default_sg_pct 
            ? (typeof parameter.default_sg_pct === 'number' ? parameter.default_sg_pct : parseFloat(parameter.default_sg_pct))
            : undefined,
        stopGainDropPercent: parameter.default_sg_drop_pct 
            ? (typeof parameter.default_sg_drop_pct === 'number' ? parameter.default_sg_drop_pct : parseFloat(parameter.default_sg_drop_pct))
            : undefined,
        trailingStopGain: parameter.default_tsg_enabled || false,
        trailingStopGainActivationPct: parameter.default_tsg_activation_pct 
            ? (typeof parameter.default_tsg_activation_pct === 'number' ? parameter.default_tsg_activation_pct : parseFloat(parameter.default_tsg_activation_pct))
            : undefined,
        trailingStopGainDropPct: parameter.default_tsg_drop_pct 
            ? (typeof parameter.default_tsg_drop_pct === 'number' ? parameter.default_tsg_drop_pct : parseFloat(parameter.default_tsg_drop_pct))
            : undefined,
        minProfitPct: parameter.min_profit_pct 
            ? (typeof parameter.min_profit_pct === 'number' ? parameter.min_profit_pct : parseFloat(parameter.min_profit_pct))
            : undefined,
        trailingStop: parameter.trailing_stop_enabled || false,
        maxDailyTrades: parameter.max_orders_per_hour 
            ? (typeof parameter.max_orders_per_hour === 'number' ? parameter.max_orders_per_hour : parseInt(parameter.max_orders_per_hour))
            : undefined,
        maxWeeklyTrades: undefined, // Não existe no schema
        groupPositionsEnabled: parameter.group_positions_enabled || false,
        groupPositionsIntervalMinutes: parameter.group_positions_interval_minutes 
            ? (typeof parameter.group_positions_interval_minutes === 'number' ? parameter.group_positions_interval_minutes : parseInt(parameter.group_positions_interval_minutes))
            : undefined,
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

