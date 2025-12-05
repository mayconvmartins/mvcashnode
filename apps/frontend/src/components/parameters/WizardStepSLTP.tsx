'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface WizardStepSLTPProps {
    data: any
    updateData: (data: any) => void
}

export function WizardStepSLTP({ data, updateData }: WizardStepSLTPProps) {
    const hasCurrentValues = data.stopLossPercent || data.takeProfitPercent || data.minProfitPct || data.trailingStop
    
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-4">Stop Loss e Take Profit</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    Configure os valores padrão de SL e TP (opcional)
                </p>
                {hasCurrentValues && (
                    <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3 mb-4">
                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">Valores atuais:</p>
                        <div className="space-y-1 text-sm">
                            {data.stopLossPercent && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Stop Loss:</span>
                                    <span className="font-medium">{data.stopLossPercent}%</span>
                                </div>
                            )}
                            {data.takeProfitPercent && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Take Profit:</span>
                                    <span className="font-medium">{data.takeProfitPercent}%</span>
                                </div>
                            )}
                            {data.minProfitPct && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Lucro Mínimo:</span>
                                    <span className="font-medium">{data.minProfitPct}%</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Trailing Stop:</span>
                                <span className="font-medium">{data.trailingStop ? 'Habilitado' : 'Desabilitado'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div>
                    <Label htmlFor="stopLossPercent">Stop Loss (%)</Label>
                    <Input
                        id="stopLossPercent"
                        type="number"
                        step="0.1"
                        min="0"
                        value={data.stopLossPercent || ''}
                        onChange={(e) => updateData({ stopLossPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                        placeholder="Ex: 2.5"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                        Porcentagem de perda máxima da entrada
                    </p>
                </div>

                <div>
                    <Label htmlFor="takeProfitPercent">Take Profit (%)</Label>
                    <Input
                        id="takeProfitPercent"
                        type="number"
                        step="0.1"
                        min="0"
                        value={data.takeProfitPercent || ''}
                        onChange={(e) => updateData({ takeProfitPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                        placeholder="Ex: 5.0"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                        Porcentagem de lucro alvo da entrada
                    </p>
                </div>

                <div>
                    <Label htmlFor="minProfitPct">Lucro Mínimo (%) *</Label>
                    <Input
                        id="minProfitPct"
                        type="number"
                        step="0.1"
                        min="0.1"
                        required
                        value={data.minProfitPct || ''}
                        onChange={(e) => updateData({ minProfitPct: e.target.value ? parseFloat(e.target.value) : undefined })}
                        placeholder="Ex: 1.0"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                        Lucro mínimo necessário para executar venda via webhook. Stop loss ignora esta validação.
                    </p>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="space-y-0.5">
                        <Label htmlFor="trailingStop">Trailing Stop</Label>
                        <p className="text-sm text-muted-foreground">
                            Stop loss dinâmico que acompanha o preço
                        </p>
                    </div>
                    <Switch
                        id="trailingStop"
                        checked={data.trailingStop}
                        onCheckedChange={(checked) => updateData({ trailingStop: checked })}
                    />
                </div>

                {data.stopLossPercent && data.takeProfitPercent && (
                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Resumo</h4>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Risk:Reward Ratio:</span>
                                <span className="font-medium">
                                    1:{(data.takeProfitPercent / data.stopLossPercent).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Trailing Stop:</span>
                                <span className="font-medium">{data.trailingStop ? 'Sim' : 'Não'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

