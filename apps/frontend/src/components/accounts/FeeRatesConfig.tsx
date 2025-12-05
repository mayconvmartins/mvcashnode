'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Save, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'

interface FeeRatesConfigProps {
    accountId: number
    account: any
}

export function FeeRatesConfig({ accountId, account }: FeeRatesConfigProps) {
    const queryClient = useQueryClient()
    
    const [feeRates, setFeeRates] = useState({
        feeRateBuyLimit: account.fee_rate_buy_limit ? (Number(account.fee_rate_buy_limit) * 100).toFixed(4) : '',
        feeRateBuyMarket: account.fee_rate_buy_market ? (Number(account.fee_rate_buy_market) * 100).toFixed(4) : '',
        feeRateSellLimit: account.fee_rate_sell_limit ? (Number(account.fee_rate_sell_limit) * 100).toFixed(4) : '',
        feeRateSellMarket: account.fee_rate_sell_market ? (Number(account.fee_rate_sell_market) * 100).toFixed(4) : '',
    })

    const updateFeeRatesMutation = useMutation({
        mutationFn: async (rates: {
            feeRateBuyLimit?: number
            feeRateBuyMarket?: number
            feeRateSellLimit?: number
            feeRateSellMarket?: number
        }) => {
            // Converter de porcentagem para decimal
            const payload: any = {}
            if (rates.feeRateBuyLimit !== undefined) {
                payload.feeRateBuyLimit = rates.feeRateBuyLimit / 100
            }
            if (rates.feeRateBuyMarket !== undefined) {
                payload.feeRateBuyMarket = rates.feeRateBuyMarket / 100
            }
            if (rates.feeRateSellLimit !== undefined) {
                payload.feeRateSellLimit = rates.feeRateSellLimit / 100
            }
            if (rates.feeRateSellMarket !== undefined) {
                payload.feeRateSellMarket = rates.feeRateSellMarket / 100
            }
            
            const response = await apiClient.put(`/exchange-accounts/${accountId}/fee-rates`, payload)
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['account', accountId] })
            toast.success('Taxas atualizadas com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar taxas')
        },
    })

    const handleSave = () => {
        const rates: any = {}
        
        if (feeRates.feeRateBuyLimit) {
            rates.feeRateBuyLimit = parseFloat(feeRates.feeRateBuyLimit)
        }
        if (feeRates.feeRateBuyMarket) {
            rates.feeRateBuyMarket = parseFloat(feeRates.feeRateBuyMarket)
        }
        if (feeRates.feeRateSellLimit) {
            rates.feeRateSellLimit = parseFloat(feeRates.feeRateSellLimit)
        }
        if (feeRates.feeRateSellMarket) {
            rates.feeRateSellMarket = parseFloat(feeRates.feeRateSellMarket)
        }

        updateFeeRatesMutation.mutate(rates)
    }

    return (
        <Card className="glass">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Configuração de Taxas
                </CardTitle>
                <CardDescription>
                    Configure as taxas desta conta. Essas taxas serão usadas quando não for possível obter as taxas reais da exchange.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                        <strong>Importante:</strong> As taxas devem ser informadas em porcentagem (ex: 0.1 para 0.1%). 
                        Deixe em branco se não quiser configurar uma taxa específica.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Taxas de Compra */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-green-500" />
                            Compra (BUY)
                        </h3>
                        
                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="feeRateBuyLimit">Taxa para Compra Limit (%)</Label>
                                <Input
                                    id="feeRateBuyLimit"
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    max="100"
                                    placeholder="0.1000"
                                    value={feeRates.feeRateBuyLimit}
                                    onChange={(e) => setFeeRates({ ...feeRates, feeRateBuyLimit: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ex: 0.1 = 0.1% de taxa
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="feeRateBuyMarket">Taxa para Compra Market (%)</Label>
                                <Input
                                    id="feeRateBuyMarket"
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    max="100"
                                    placeholder="0.1000"
                                    value={feeRates.feeRateBuyMarket}
                                    onChange={(e) => setFeeRates({ ...feeRates, feeRateBuyMarket: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ex: 0.1 = 0.1% de taxa
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Taxas de Venda */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <TrendingDown className="h-5 w-5 text-red-500" />
                            Venda (SELL)
                        </h3>
                        
                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="feeRateSellLimit">Taxa para Venda Limit (%)</Label>
                                <Input
                                    id="feeRateSellLimit"
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    max="100"
                                    placeholder="0.1000"
                                    value={feeRates.feeRateSellLimit}
                                    onChange={(e) => setFeeRates({ ...feeRates, feeRateSellLimit: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ex: 0.1 = 0.1% de taxa
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="feeRateSellMarket">Taxa para Venda Market (%)</Label>
                                <Input
                                    id="feeRateSellMarket"
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    max="100"
                                    placeholder="0.1000"
                                    value={feeRates.feeRateSellMarket}
                                    onChange={(e) => setFeeRates({ ...feeRates, feeRateSellMarket: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ex: 0.1 = 0.1% de taxa
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button
                        onClick={handleSave}
                        disabled={updateFeeRatesMutation.isPending}
                    >
                        {updateFeeRatesMutation.isPending ? (
                            <>
                                <Save className="h-4 w-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                Salvar Taxas
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
