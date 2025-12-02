'use client'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface WizardStepOrderSizeProps {
    data: any
    updateData: (data: any) => void
}

export function WizardStepOrderSize({ data, updateData }: WizardStepOrderSizeProps) {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-4">Tamanho da Ordem</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    Configure como calcular o tamanho das ordens
                </p>
            </div>

            <div className="space-y-4">
                <div>
                    <Label>Tipo de Tamanho *</Label>
                    <RadioGroup
                        value={data.orderSizeType}
                        onValueChange={(value) => updateData({ orderSizeType: value })}
                        className="mt-2"
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="PERCENT" id="percent" />
                            <Label htmlFor="percent" className="font-normal cursor-pointer">
                                Porcentagem do Saldo
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="FIXED" id="fixed" />
                            <Label htmlFor="fixed" className="font-normal cursor-pointer">
                                Valor Fixo (USDT)
                            </Label>
                        </div>
                    </RadioGroup>
                </div>

                <div>
                    <Label htmlFor="orderSizeValue">
                        {data.orderSizeType === 'PERCENT' ? 'Porcentagem (%)' : 'Valor (USDT)'} *
                    </Label>
                    <Input
                        id="orderSizeValue"
                        type="number"
                        step={data.orderSizeType === 'PERCENT' ? '0.1' : '1'}
                        min="0"
                        value={data.orderSizeValue}
                        onChange={(e) => updateData({ orderSizeValue: parseFloat(e.target.value) })}
                        placeholder={data.orderSizeType === 'PERCENT' ? 'Ex: 50' : 'Ex: 1000'}
                        required
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                        {data.orderSizeType === 'PERCENT'
                            ? 'Porcentagem do saldo disponível (1-100%)'
                            : 'Valor fixo em USDT por ordem'}
                    </p>
                </div>

                {data.orderSizeType === 'PERCENT' && data.orderSizeValue > 100 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3">
                        <p className="text-sm text-yellow-600 dark:text-yellow-500">
                            ⚠️ Valores acima de 100% usarão alavancagem (se disponível)
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

