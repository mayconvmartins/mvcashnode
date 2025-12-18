'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface WizardStepSLTPProps {
    data: any
    updateData: (data: any) => void
}

export function WizardStepSLTP({ data, updateData }: WizardStepSLTPProps) {
    const hasCurrentValues = data.stopLossPercent || data.takeProfitPercent || data.stopGainPercent || data.stopGainDropPercent || data.trailingStopGain || data.trailingStopGainActivationPct || data.trailingStopGainDropPct || data.minProfitPct || data.trailingStop
    
    // Validação: Stop Gain deve ser menor que Take Profit
    const sgError = data.stopGain && data.takeProfitPercent && data.stopGainPercent && 
      data.stopGainPercent >= data.takeProfitPercent 
      ? 'Stop Gain deve ser menor que Take Profit' 
      : null

    // Validação: sgDropPercent deve ser > 0 e < sgPercent
    const sgDropError = data.stopGain && data.stopGainDropPercent && data.stopGainPercent &&
      (data.stopGainDropPercent <= 0 || data.stopGainDropPercent >= data.stopGainPercent)
      ? 'Queda deve ser maior que 0 e menor que Stop Gain'
      : null
    
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
                            {data.stopGainPercent && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Stop Gain:</span>
                                    <span className="font-medium">{data.stopGainPercent}%</span>
                                </div>
                            )}
                            {data.trailingStopGain && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Trailing Stop Gain:</span>
                                    <span className="font-medium">Habilitado</span>
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

                {data.takeProfitPercent && (
                    <div className="mt-3 p-4 bg-muted/50 rounded-lg border border-dashed">
                        <div className="flex items-center justify-between mb-3">
                            <Label>Stop Gain (Saída Antecipada)</Label>
                            <Switch
                                checked={data.stopGain || false}
                                onCheckedChange={(checked) => updateData({ stopGain: checked })}
                            />
                        </div>
                        {data.stopGain && (
                            <>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max={data.takeProfitPercent}
                                    value={data.stopGainPercent || ''}
                                    onChange={(e) => updateData({ stopGainPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                                    placeholder="Ex: 2.0"
                                />
                                {sgError && <p className="text-xs text-destructive mt-2">{sgError}</p>}
                                {!sgError && data.stopGainPercent && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Ativa quando atingir {data.stopGainPercent}%
                                    </p>
                                )}
                                
                                {data.stopGainPercent && !sgError && (
                                    <div className="mt-3">
                                        <Label>Queda do Stop Gain (%) *</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            max={data.stopGainPercent}
                                            value={data.stopGainDropPercent || ''}
                                            onChange={(e) => updateData({ stopGainDropPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                                            placeholder="Ex: 0.5"
                                        />
                                        {sgDropError && <p className="text-xs text-destructive mt-2">{sgDropError}</p>}
                                        {!sgDropError && data.stopGainDropPercent && data.stopGainPercent && (
                                            <p className="text-xs text-muted-foreground mt-2">
                                                Vende se cair {data.stopGainDropPercent}% após ativar (venda em {data.stopGainPercent - data.stopGainDropPercent}%)
                                            </p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* TSG - Independente de TP */}
                <div className="mt-4 p-4 bg-amber-50/50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-between mb-3">
                        <Label>Trailing Stop Gain (Rastreamento Dinâmico)</Label>
                        <Switch
                            checked={data.trailingStopGain || false}
                            onCheckedChange={(checked) => {
                                updateData({ trailingStopGain: checked })
                                if (!checked) {
                                    updateData({ 
                                        trailingStopGainActivationPct: undefined,
                                        trailingStopGainDropPct: undefined
                                    })
                                }
                            }}
                            disabled={data.stopGain}
                        />
                    </div>
                    {data.stopGain && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                            Desabilite o Stop Gain fixo para usar Trailing Stop Gain
                        </p>
                    )}
                    {data.trailingStopGain && (
                        <div className="space-y-3">
                            <div>
                                <Label>% Inicial de Ativação</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={data.trailingStopGainActivationPct || ''}
                                    onChange={(e) => updateData({ trailingStopGainActivationPct: e.target.value ? parseFloat(e.target.value) : undefined })}
                                    placeholder="Ex: 2.0"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ativa o rastreamento quando atingir este lucro
                                </p>
                            </div>
                            
                            <div>
                                <Label>% de Queda do Pico para Vender</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={data.trailingStopGainDropPct || ''}
                                    onChange={(e) => updateData({ trailingStopGainDropPct: e.target.value ? parseFloat(e.target.value) : undefined })}
                                    placeholder="Ex: 0.5 ou 1.0"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Vende se cair esta % a partir do pico máximo atingido
                                </p>
                            </div>
                            
                            {data.trailingStopGainActivationPct && data.trailingStopGainDropPct && (
                                <div className="bg-amber-100/50 dark:bg-amber-900/40 p-3 rounded border border-amber-300 dark:border-amber-700">
                                    <p className="text-xs font-medium mb-1">Exemplo:</p>
                                    <ul className="text-xs space-y-1 text-muted-foreground">
                                        <li>• Ativa em {data.trailingStopGainActivationPct}%</li>
                                        <li>• Se atingir 20%, vende se cair para {(20 - data.trailingStopGainDropPct).toFixed(1)}%</li>
                                        <li>• Sem limite máximo de lucro rastreado</li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
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

