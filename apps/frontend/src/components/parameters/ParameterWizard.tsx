'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { tradeParametersService } from '@/lib/api/trade-parameters.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { WizardStepAccount } from './WizardStepAccount'
import { WizardStepOrderSize } from './WizardStepOrderSize'
import { WizardStepSLTP } from './WizardStepSLTP'
import { WizardStepLimits } from './WizardStepLimits'
import { cn } from '@/lib/utils'
import { 
    Wallet, 
    Layers, 
    Target, 
    Shield, 
    Check,
    ChevronLeft,
    ChevronRight,
    Loader2,
} from 'lucide-react'

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
    stopGain?: boolean
    stopGainPercent?: number
    stopGainDropPercent?: number
    trailingStopGain?: boolean
    trailingStopGainActivationPct?: number
    trailingStopGainDropPct?: number
    minProfitPct?: number
    trailingStop?: boolean
    maxDailyTrades?: number
    maxWeeklyTrades?: number
    groupPositionsEnabled?: boolean
    groupPositionsIntervalMinutes?: number
    vaultId?: string
}

const steps = [
    { number: 1, title: 'Conta & Símbolo', shortTitle: 'Conta', icon: Wallet },
    { number: 2, title: 'Tamanho da Ordem', shortTitle: 'Ordem', icon: Layers },
    { number: 3, title: 'SL/TP', shortTitle: 'SL/TP', icon: Target },
    { number: 4, title: 'Limites & Vault', shortTitle: 'Limites', icon: Shield },
]

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
        stopGain: parameter?.stopGain,
        stopGainPercent: parameter?.stopGainPercent,
        stopGainDropPercent: parameter?.stopGainDropPercent,
        trailingStopGain: parameter?.default_tsg_enabled || parameter?.trailingStopGain || false,
        trailingStopGainActivationPct: parameter?.default_tsg_activation_pct 
            ? (typeof parameter.default_tsg_activation_pct === 'number' ? parameter.default_tsg_activation_pct : parseFloat(parameter.default_tsg_activation_pct))
            : (parameter?.trailingStopGainActivationPct),
        trailingStopGainDropPct: parameter?.default_tsg_drop_pct 
            ? (typeof parameter.default_tsg_drop_pct === 'number' ? parameter.default_tsg_drop_pct : parseFloat(parameter.default_tsg_drop_pct))
            : (parameter?.trailingStopGainDropPct),
        minProfitPct: parameter?.min_profit_pct || parameter?.minProfitPct,
        trailingStop: parameter?.trailingStop || false,
        maxDailyTrades: parameter?.maxDailyTrades,
        maxWeeklyTrades: parameter?.maxWeeklyTrades,
        groupPositionsEnabled: parameter?.group_positions_enabled || parameter?.groupPositionsEnabled || false,
        groupPositionsIntervalMinutes: parameter?.group_positions_interval_minutes || parameter?.groupPositionsIntervalMinutes,
        vaultId: parameter?.vault?.id,
    })

    const mutation = useMutation({
        mutationFn: () => {
            const payload: any = {
                exchange_account_id: data.accountId ? Number(data.accountId) : undefined,
                symbol: data.symbol,
                side: data.side,
                orderSizeType: data.orderSizeType,
                orderSizeValue: data.orderSizeValue,
                stopLossPercent: data.stopLossPercent,
                takeProfitPercent: data.takeProfitPercent,
                stopGain: data.stopGain,
                stopGainPercent: data.stopGainPercent,
                stopGainDropPercent: data.stopGainDropPercent,
                trailingStopGain: data.trailingStopGain,
                trailingStopGainActivationPct: data.trailingStopGainActivationPct,
                trailingStopGainDropPct: data.trailingStopGainDropPct,
                minProfitPct: data.minProfitPct,
                trailingStop: data.trailingStop,
                maxDailyTrades: data.maxDailyTrades,
                maxWeeklyTrades: data.maxWeeklyTrades,
                groupPositionsEnabled: data.groupPositionsEnabled,
                groupPositionsIntervalMinutes: data.groupPositionsIntervalMinutes,
                vaultId: data.vaultId ? Number(data.vaultId) : undefined,
            }
            
            if (parameter) {
                return tradeParametersService.update(parameter.id, payload)
            }
            return tradeParametersService.create(payload)
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
        // Validations per step
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
        if (currentStep === 3) {
            if (!data.minProfitPct || data.minProfitPct <= 0) {
                toast.error('Lucro mínimo é obrigatório e deve ser maior que zero')
                return
            }
        }
        if (currentStep === 4) {
            if (data.groupPositionsEnabled && (!data.groupPositionsIntervalMinutes || data.groupPositionsIntervalMinutes <= 0)) {
                toast.error('Intervalo de agrupamento é obrigatório quando habilitado')
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

    const handleStepClick = (stepNumber: number) => {
        // Only allow going back to completed steps
        if (stepNumber < currentStep) {
            setCurrentStep(stepNumber)
        }
    }

    const CurrentStepComponent = currentStep === 1 
        ? WizardStepAccount 
        : currentStep === 2 
        ? WizardStepOrderSize 
        : currentStep === 3 
        ? WizardStepSLTP 
        : WizardStepLimits

    const isEditing = !!parameter
    const currentStepInfo = steps[currentStep - 1]

    return (
        <div className="space-y-6">
            {/* Progress Steps */}
            <div className="relative">
                {/* Progress Line */}
                <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted hidden sm:block">
                    <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
                    />
                </div>

                {/* Steps */}
                <div className="flex items-start justify-between relative">
                    {steps.map((step, index) => {
                        const isCompleted = currentStep > step.number
                        const isCurrent = currentStep === step.number
                        const StepIcon = step.icon

                        return (
                            <button
                                key={step.number}
                                onClick={() => handleStepClick(step.number)}
                                disabled={step.number > currentStep}
                                className={cn(
                                    'flex flex-col items-center flex-1 transition-all',
                                    step.number > currentStep && 'opacity-50 cursor-not-allowed',
                                    step.number < currentStep && 'cursor-pointer'
                                )}
                            >
                                <div
                                    className={cn(
                                        'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 relative z-10',
                                        isCompleted && 'bg-primary text-primary-foreground',
                                        isCurrent && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                                        !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    {isCompleted ? (
                                        <Check className="h-5 w-5" />
                                    ) : (
                                        <StepIcon className="h-5 w-5" />
                                    )}
                                </div>
                                <span className={cn(
                                    'text-xs sm:text-sm mt-2 text-center font-medium transition-colors',
                                    isCurrent && 'text-primary',
                                    !isCurrent && 'text-muted-foreground'
                                )}>
                                    <span className="hidden sm:inline">{step.title}</span>
                                    <span className="sm:hidden">{step.shortTitle}</span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Step Content */}
            <Card className="border-0 shadow-none sm:border sm:shadow-sm">
                <CardContent className="p-0 sm:p-6">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <currentStepInfo.icon className="h-5 w-5 text-primary" />
                            {currentStepInfo.title}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Passo {currentStep} de {steps.length}
                        </p>
                    </div>

                    <div className="min-h-[280px]">
                        {currentStep === 1 ? (
                            <WizardStepAccount data={data} updateData={updateData} isEditing={isEditing} />
                        ) : (
                            <CurrentStepComponent data={data} updateData={updateData} />
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t">
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={currentStep === 1 ? onCancel : handleBack}
                    className="gap-2"
                >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">
                        {currentStep === 1 ? 'Cancelar' : 'Voltar'}
                    </span>
                    <span className="sm:hidden">
                        {currentStep === 1 ? 'Sair' : 'Voltar'}
                    </span>
                </Button>

                <div className="flex items-center gap-2">
                    {/* Step indicators for mobile */}
                    <div className="flex items-center gap-1 sm:hidden">
                        {steps.map((step) => (
                            <div
                                key={step.number}
                                className={cn(
                                    'w-2 h-2 rounded-full transition-colors',
                                    currentStep >= step.number ? 'bg-primary' : 'bg-muted'
                                )}
                            />
                        ))}
                    </div>

                    <Button 
                        type="button" 
                        onClick={handleNext} 
                        disabled={mutation.isPending}
                        className="gap-2 min-w-[120px]"
                    >
                        {mutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : currentStep === 4 ? (
                            <>
                                <Check className="h-4 w-4" />
                                {parameter ? 'Atualizar' : 'Criar'}
                            </>
                        ) : (
                            <>
                                Próximo
                                <ChevronRight className="h-4 w-4" />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
