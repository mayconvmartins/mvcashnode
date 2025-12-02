'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { tradeParametersService } from '@/lib/api/trade-parameters.service'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { WizardStepAccount } from './WizardStepAccount'
import { WizardStepOrderSize } from './WizardStepOrderSize'
import { WizardStepSLTP } from './WizardStepSLTP'
import { WizardStepLimits } from './WizardStepLimits'

interface ParameterWizardProps {
    parameter?: any
    onSuccess: (parameter: any) => void
    onCancel: () => void
}

type WizardData = {
    accountId: string
    symbol: string
    side: 'BUY' | 'SELL'
    orderSizeType: 'FIXED' | 'PERCENT'
    orderSizeValue: number
    stopLossPercent?: number
    takeProfitPercent?: number
    trailingStop?: boolean
    maxDailyTrades?: number
    maxWeeklyTrades?: number
    vaultId?: string
}

export function ParameterWizard({ parameter, onSuccess, onCancel }: ParameterWizardProps) {
    const [currentStep, setCurrentStep] = useState(1)
    const [data, setData] = useState<WizardData>({
        accountId: parameter?.account?.id || '',
        symbol: parameter?.symbol || '',
        side: parameter?.side || 'BUY',
        orderSizeType: parameter?.orderSizeType || 'PERCENT',
        orderSizeValue: parameter?.orderSizeValue || 100,
        stopLossPercent: parameter?.stopLossPercent,
        takeProfitPercent: parameter?.takeProfitPercent,
        trailingStop: parameter?.trailingStop || false,
        maxDailyTrades: parameter?.maxDailyTrades,
        maxWeeklyTrades: parameter?.maxWeeklyTrades,
        vaultId: parameter?.vault?.id,
    })

    const mutation = useMutation({
        mutationFn: () => {
            if (parameter) {
                return tradeParametersService.update(parameter.id, data)
            }
            return tradeParametersService.create(data)
        },
        onSuccess: (result) => {
            toast.success(parameter ? 'Parâmetro atualizado!' : 'Parâmetro criado!')
            onSuccess(result)
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao salvar parâmetro')
        },
    })

    const updateData = (partialData: Partial<WizardData>) => {
        setData((prev) => ({ ...prev, ...partialData }))
    }

    const handleNext = () => {
        // Validações por passo
        if (currentStep === 1) {
            if (!data.accountId || !data.symbol || !data.side) {
                toast.error('Preencha todos os campos obrigatórios')
                return
            }
        }
        if (currentStep === 2) {
            if (!data.orderSizeValue || data.orderSizeValue <= 0) {
                toast.error('Tamanho da ordem inválido')
                return
            }
        }

        if (currentStep < 4) {
            setCurrentStep(currentStep + 1)
        } else {
            mutation.mutate()
        }
    }

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1)
        }
    }

    const steps = [
        { number: 1, title: 'Conta & Símbolo', component: WizardStepAccount },
        { number: 2, title: 'Tamanho da Ordem', component: WizardStepOrderSize },
        { number: 3, title: 'SL/TP', component: WizardStepSLTP },
        { number: 4, title: 'Limites & Vault', component: WizardStepLimits },
    ]

    const CurrentStepComponent = steps[currentStep - 1].component

    return (
        <div className="space-y-6">
            {/* Progress */}
            <div className="flex items-center justify-between">
                {steps.map((step, index) => (
                    <div key={step.number} className="flex items-center flex-1">
                        <div className="flex flex-col items-center flex-1">
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                                    currentStep >= step.number
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground'
                                }`}
                            >
                                {step.number}
                            </div>
                            <span className="text-sm mt-2 text-center">{step.title}</span>
                        </div>
                        {index < steps.length - 1 && (
                            <div
                                className={`h-1 flex-1 mx-2 ${
                                    currentStep > step.number ? 'bg-primary' : 'bg-muted'
                                }`}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Step Content */}
            <div className="min-h-[300px]">
                <CurrentStepComponent data={data} updateData={updateData} />
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t">
                <Button type="button" variant="outline" onClick={currentStep === 1 ? onCancel : handleBack}>
                    {currentStep === 1 ? 'Cancelar' : 'Voltar'}
                </Button>
                <Button type="button" onClick={handleNext} disabled={mutation.isPending}>
                    {currentStep === 4
                        ? mutation.isPending
                            ? 'Salvando...'
                            : parameter
                            ? 'Atualizar'
                            : 'Criar'
                        : 'Próximo'}
                </Button>
            </div>
        </div>
    )
}

