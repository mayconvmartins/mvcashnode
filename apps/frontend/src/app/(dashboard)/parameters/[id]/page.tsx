'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { tradeParametersService } from '@/lib/api/trade-parameters.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Edit, Settings, DollarSign, Shield, TrendingUp, Clock, Database } from 'lucide-react'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils/format'

export default function ParameterDetailPage() {
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
                <Skeleton className="h-[400px]" />
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

    const account = (parameter as any).exchange_account
    const vault = (parameter as any).vault

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/parameters')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">
                            {parameter.symbol.includes(',') ? (
                                <span>
                                    {parameter.symbol.split(',').length} Símbolos - {parameter.side}
                                </span>
                            ) : (
                                <span>
                                    {parameter.symbol} - {parameter.side}
                                </span>
                            )}
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {account?.label || `Conta ID: ${parameter.exchange_account_id}`}
                            {account?.is_simulation && (
                                <Badge variant="secondary" className="ml-2">Simulação</Badge>
                            )}
                        </p>
                    </div>
                </div>
                <Link href={`/parameters/${parameter.id}/edit`}>
                    <Button variant="gradient">
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                    </Button>
                </Link>
            </div>

            {/* Informações Principais */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Configuração Básica
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <label className="text-xs text-muted-foreground">Símbolo(s)</label>
                            <div className="mt-2">
                                {parameter.symbol.includes(',') ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {parameter.symbol.split(',').map((sym: string, index: number) => (
                                            <Badge 
                                                key={index} 
                                                variant="outline" 
                                                className="font-mono text-sm py-1 px-2 justify-center"
                                            >
                                                {sym.trim()}
                                            </Badge>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="font-mono text-lg font-semibold">{parameter.symbol}</div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Lado</label>
                            <div className="mt-1">
                                <Badge 
                                    variant={parameter.side === 'BUY' ? 'success' : parameter.side === 'SELL' ? 'destructive' : 'secondary'}
                                    className="text-sm"
                                >
                                    {parameter.side}
                                </Badge>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Tipo de Ordem Padrão</label>
                            <div className="font-semibold">{parameter.order_type_default}</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Tamanho da Ordem
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {parameter.quote_amount_fixed ? (
                            <div>
                                <label className="text-xs text-muted-foreground">Valor Fixo</label>
                                <div className="text-lg font-semibold">
                                    ${parameter.quote_amount_fixed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        ) : parameter.quote_amount_pct_balance ? (
                            <div>
                                <label className="text-xs text-muted-foreground">Percentual do Saldo</label>
                                <div className="text-lg font-semibold">
                                    {parameter.quote_amount_pct_balance}%
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">Não configurado</div>
                        )}
                        {parameter.slippage_bps !== undefined && parameter.slippage_bps > 0 && (
                            <div>
                                <label className="text-xs text-muted-foreground">Slippage</label>
                                <div className="text-sm">{(parameter.slippage_bps / 100).toFixed(2)}%</div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Stop Loss / Take Profit
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {parameter.default_sl_enabled && parameter.default_sl_pct ? (
                            <div>
                                <label className="text-xs text-muted-foreground">Stop Loss</label>
                                <div className="text-lg font-semibold text-red-500">
                                    {parameter.default_sl_pct}%
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">SL desabilitado</div>
                        )}
                        {parameter.default_tp_enabled && parameter.default_tp_pct ? (
                            <div>
                                <label className="text-xs text-muted-foreground">Take Profit</label>
                                <div className="text-lg font-semibold text-green-500">
                                    {parameter.default_tp_pct}%
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">TP desabilitado</div>
                        )}
                        {parameter.default_sg_enabled && parameter.default_sg_pct ? (
                            <div>
                                <label className="text-xs text-muted-foreground">Stop Gain</label>
                                <div className="text-lg font-semibold text-purple-500">
                                    Ativa em: {parameter.default_sg_pct}%
                                </div>
                                {parameter.default_sg_drop_pct && (
                                    <div className="text-sm text-muted-foreground">
                                        Vende com queda de: {parameter.default_sg_drop_pct}%
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">SG desabilitado</div>
                        )}
                        {parameter.default_tsg_enabled && parameter.default_tsg_activation_pct ? (
                            <div>
                                <label className="text-xs text-muted-foreground">Trailing Stop Gain</label>
                                <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                                    Ativa em: {parameter.default_tsg_activation_pct}%
                                </div>
                                {parameter.default_tsg_drop_pct && (
                                    <div className="text-sm text-muted-foreground">
                                        Vende com queda de: {parameter.default_tsg_drop_pct}% do pico máximo
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">TSG desabilitado</div>
                        )}
                        {parameter.trailing_stop_enabled && parameter.trailing_distance_pct && (
                            <div>
                                <label className="text-xs text-muted-foreground">Trailing Stop</label>
                                <div className="text-sm">
                                    {parameter.trailing_distance_pct}% de distância
                                </div>
                            </div>
                        )}
                        {parameter.min_profit_pct && (
                            <div>
                                <label className="text-xs text-muted-foreground">Lucro Mínimo</label>
                                <div className="text-lg font-semibold text-blue-500">
                                    {parameter.min_profit_pct}%
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Lucro mínimo necessário para executar venda via webhook
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Limites e Restrições */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Limites e Restrições
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Máximo de Ordens por Hora</label>
                            <div className="mt-1 text-lg">
                                {parameter.max_orders_per_hour ? (
                                    <span className="font-semibold">{parameter.max_orders_per_hour}</span>
                                ) : (
                                    <span className="text-muted-foreground">Sem limite</span>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Intervalo Mínimo (segundos)</label>
                            <div className="mt-1 text-lg">
                                {parameter.min_interval_sec ? (
                                    <span className="font-semibold">{parameter.min_interval_sec}s</span>
                                ) : (
                                    <span className="text-muted-foreground">Sem restrição</span>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Cofre e Informações Adicionais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="glass">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5" />
                            Cofre Vinculado
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {vault ? (
                            <div>
                                <Link href={`/vaults/${vault.id}`} className="hover:underline">
                                    <div className="font-semibold">{vault.name}</div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                        Modo: {vault.trade_mode}
                                    </div>
                                </Link>
                            </div>
                        ) : (
                            <div className="text-muted-foreground">Nenhum cofre vinculado</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader>
                        <CardTitle>Informações do Sistema</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <label className="text-xs text-muted-foreground">ID do Parâmetro</label>
                            <div className="font-mono text-sm">#{parameter.id}</div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Criado em</label>
                            <div className="text-sm">{formatDateTime(parameter.created_at)}</div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Atualizado em</label>
                            <div className="text-sm">{formatDateTime(parameter.updated_at)}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

