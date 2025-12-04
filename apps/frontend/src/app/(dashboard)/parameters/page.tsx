'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, Copy, Eye } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { tradeParametersService } from '@/lib/api/trade-parameters.service'
import type { TradeParameter } from '@/lib/types'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'

export default function ParametersPage() {
    const queryClient = useQueryClient()
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

    const { data: parameters, isLoading } = useQuery({
        queryKey: ['trade-parameters'],
        queryFn: tradeParametersService.list,
    })

    const deleteMutation = useMutation({
        mutationFn: tradeParametersService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trade-parameters'] })
            toast.success('Parâmetro excluído com sucesso!')
            setDeleteConfirmId(null)
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao excluir parâmetro')
        },
    })

    const duplicateMutation = useMutation({
        mutationFn: async (id: number) => {
            const param = parameters?.find(p => p.id === id)
            if (!param) throw new Error('Parâmetro não encontrado')
            
            // Função auxiliar para converter valores Decimal para número
            const toNumber = (value: any): number | undefined => {
                if (value === null || value === undefined) return undefined
                if (typeof value === 'number') return value
                if (typeof value === 'object' && 'toNumber' in value) {
                    return value.toNumber()
                }
                const num = Number(value)
                return isNaN(num) ? undefined : num
            }
            
            // Mapear campos do TradeParameter para CreateTradeParameterDto
            // Remover campos que não devem ser enviados (id, created_at, updated_at, exchange_account, vault)
            const createData = {
                exchange_account_id: param.exchange_account_id,
                symbol: param.symbol,
                side: param.side,
                quote_amount_fixed: toNumber(param.quote_amount_fixed),
                quote_amount_pct_balance: toNumber(param.quote_amount_pct_balance),
                max_orders_per_hour: param.max_orders_per_hour ?? undefined,
                min_interval_sec: param.min_interval_sec ?? undefined,
                order_type_default: param.order_type_default,
                slippage_bps: param.slippage_bps ?? 0,
                default_sl_enabled: param.default_sl_enabled,
                default_sl_pct: toNumber(param.default_sl_pct),
                default_tp_enabled: param.default_tp_enabled,
                default_tp_pct: toNumber(param.default_tp_pct),
                trailing_stop_enabled: param.trailing_stop_enabled,
                trailing_distance_pct: toNumber(param.trailing_distance_pct),
                min_profit_pct: toNumber(param.min_profit_pct),
                vault_id: param.vault_id ?? undefined,
            }
            
            return tradeParametersService.create(createData)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trade-parameters'] })
            toast.success('Parâmetro duplicado com sucesso!')
        },
        onError: (error: any) => {
            console.error('Erro ao duplicar parâmetro:', error)
            toast.error(error.response?.data?.message || error.message || 'Falha ao duplicar parâmetro')
        },
    })

    const columns: Column<TradeParameter>[] = [
        {
            key: 'name',
            label: 'Nome',
            render: (param: any) => (
                <Link href={`/parameters/${param.id}`} className="font-medium hover:underline">
                    {param.symbol} - {param.side}
                </Link>
            ),
        },
        {
            key: 'exchange_account_id',
            label: 'Conta',
            render: (param: any) => (
                <span className="text-sm">
                    {param.exchange_account?.label || `Conta ID: ${param.exchange_account_id}`}
                </span>
            ),
        },
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (param) => <span className="font-mono">{param.symbol}</span>,
        },
        {
            key: 'side',
            label: 'Lado',
            render: (param) => (
                <Badge variant={param.side === 'BUY' ? 'success' : param.side === 'SELL' ? 'destructive' : 'secondary'}>
                    {param.side}
                </Badge>
            ),
        },
        {
            key: 'default_sl_enabled',
            label: 'SL/TP',
            render: (param) => (
                <div className="flex gap-1">
                    {param.default_sl_enabled && <Badge variant="outline">SL</Badge>}
                    {param.default_tp_enabled && <Badge variant="outline">TP</Badge>}
                    {param.trailing_stop_enabled && <Badge variant="outline">Trail</Badge>}
                </div>
            ),
        },
        {
            key: 'created_at',
            label: 'Criado em',
            render: (param) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(param.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (param) => (
                <div className="flex items-center gap-2">
                    <Link href={`/parameters/${param.id}`}>
                        <Button variant="ghost" size="sm" title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                        </Button>
                    </Link>
                    <Link href={`/parameters/${param.id}/edit`}>
                        <Button variant="ghost" size="sm" title="Editar">
                            <Edit className="h-4 w-4" />
                        </Button>
                    </Link>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateMutation.mutate(param.id)}
                        disabled={duplicateMutation.isPending}
                        title="Duplicar"
                    >
                        <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(param.id)}
                        disabled={deleteMutation.isPending}
                        title="Excluir"
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Parâmetros de Trading</h1>
                    <p className="text-muted-foreground mt-1">
                        Configure regras para automação de trades
                    </p>
                </div>
                <Link href="/parameters/new">
                    <Button variant="gradient">
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Parâmetro
                    </Button>
                </Link>
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todos os Parâmetros</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={parameters || []}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-12">
                                <p className="text-lg font-medium mb-2">Nenhum parâmetro cadastrado</p>
                                <p className="text-muted-foreground mb-4">
                                    Comece criando seu primeiro parâmetro de trading
                                </p>
                                <Link href="/parameters/new">
                                    <Button variant="gradient">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Criar Parâmetro
                                    </Button>
                                </Link>
                            </div>
                        }
                    />
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
                <DialogContent>
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Confirmar Exclusão</h3>
                        <p className="text-sm text-muted-foreground">
                            Tem certeza que deseja excluir este parâmetro? Esta ação não pode ser desfeita.
                        </p>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
                                disabled={deleteMutation.isPending}
                            >
                                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

