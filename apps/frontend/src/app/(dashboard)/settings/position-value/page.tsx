'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Save, Info, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { subscriberService } from '@/lib/api/subscriber.service'
import { formatCurrency } from '@/lib/utils/format'
import { toast } from 'sonner'

export default function PositionValuePage() {
    const queryClient = useQueryClient()
    const [value, setValue] = useState<string>('')

    // Buscar configurações atuais
    const { data: settings, isLoading, isError } = useQuery({
        queryKey: ['subscriber', 'position-settings'],
        queryFn: subscriberService.getPositionSettings,
    })

    // Atualizar valor quando dados chegarem
    useEffect(() => {
        if (settings) {
            setValue(settings.current_value.toString())
        }
    }, [settings])

    // Mutation para salvar
    const updateMutation = useMutation({
        mutationFn: (newValue: number) => subscriberService.updatePositionSettings({ quote_amount_fixed: newValue }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['subscriber', 'position-settings'] })
            toast.success(data.message || 'Valor atualizado com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao atualizar valor')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const numValue = parseFloat(value)
        
        if (isNaN(numValue) || numValue <= 0) {
            toast.error('Por favor, insira um valor válido')
            return
        }

        if (settings) {
            if (numValue < settings.min_value) {
                toast.error(`Valor mínimo permitido: ${formatCurrency(settings.min_value)}`)
                return
            }
            if (settings.max_value && numValue > settings.max_value) {
                toast.error(`Valor máximo permitido: ${formatCurrency(settings.max_value)}`)
                return
            }
        }

        updateMutation.mutate(numValue)
    }

    if (isLoading) {
        return (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-64" />
            </div>
        )
    }

    if (isError || !settings) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        Erro ao carregar configurações. Por favor, tente novamente.
                    </AlertDescription>
                </Alert>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <DollarSign className="h-6 w-6 text-green-500" />
                    Valor da Posição
                </h1>
                <p className="text-muted-foreground mt-1">
                    Configure o valor padrão para suas ordens de compra
                </p>
            </div>

            {/* Info Card */}
            <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                    {settings.message}
                </AlertDescription>
            </Alert>

            {/* Main Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Configurar Valor</CardTitle>
                    <CardDescription>
                        Este valor será usado como padrão para suas ordens de compra via webhook
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Limites Info */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground">Mínimo</p>
                                <p className="text-lg font-bold text-red-500">
                                    {formatCurrency(settings.min_value)}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground">Seu Valor</p>
                                <p className="text-lg font-bold text-primary">
                                    {formatCurrency(settings.current_value)}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground">Máximo</p>
                                <p className="text-lg font-bold text-green-500">
                                    {settings.max_value ? formatCurrency(settings.max_value) : 'Sem limite'}
                                </p>
                            </div>
                        </div>

                        {/* Input */}
                        <div className="space-y-2">
                            <Label htmlFor="value">Novo Valor (USD)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <Input
                                    id="value"
                                    type="number"
                                    min={settings.min_value}
                                    max={settings.max_value || undefined}
                                    step="1"
                                    className="pl-8 text-lg"
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    placeholder={settings.default_value.toString()}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Valor padrão do sistema: {formatCurrency(settings.default_value)}
                            </p>
                        </div>

                        {/* Submit */}
                        <Button 
                            type="submit" 
                            className="w-full" 
                            size="lg"
                            disabled={updateMutation.isPending}
                        >
                            <Save className="h-4 w-4 mr-2" />
                            {updateMutation.isPending ? 'Salvando...' : 'Salvar Valor'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Explanation Card */}
            <Card className="bg-muted/30">
                <CardContent className="p-4">
                    <h4 className="font-medium mb-2">Como funciona?</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Este valor é usado para calcular a quantidade de cada compra</li>
                        <li>Quando um sinal de compra é recebido, o sistema usará este valor</li>
                        <li>O valor mínimo e máximo são definidos pelo administrador</li>
                        <li>Se não configurar, será usado o valor padrão do sistema</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    )
}

