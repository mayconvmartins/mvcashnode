'use client'

import { useQuery } from '@tanstack/react-query'
import { vaultsService } from '@/lib/api/vaults.service'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface WizardStepLimitsProps {
    data: any
    updateData: (data: any) => void
}

export function WizardStepLimits({ data, updateData }: WizardStepLimitsProps) {
    const { data: vaults } = useQuery({
        queryKey: ['vaults'],
        queryFn: () => vaultsService.getAll(),
    })

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-4">Limites e Vault</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    Configure limites de frequência e vault opcional
                </p>
            </div>

            <div className="space-y-4">
                <div>
                    <Label htmlFor="maxDailyTrades">Máximo de Trades por Dia</Label>
                    <Input
                        id="maxDailyTrades"
                        type="number"
                        min="0"
                        value={data.maxDailyTrades || ''}
                        onChange={(e) => updateData({ maxDailyTrades: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="Ex: 5"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                        Limite diário de operações (deixe vazio para ilimitado)
                    </p>
                </div>

                <div>
                    <Label htmlFor="maxWeeklyTrades">Máximo de Trades por Semana</Label>
                    <Input
                        id="maxWeeklyTrades"
                        type="number"
                        min="0"
                        value={data.maxWeeklyTrades || ''}
                        onChange={(e) => updateData({ maxWeeklyTrades: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="Ex: 20"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                        Limite semanal de operações (deixe vazio para ilimitado)
                    </p>
                </div>

                <div>
                    <Label htmlFor="vaultId">Vault (Opcional)</Label>
                    <Select
                        value={data.vaultId || 'none'}
                        onValueChange={(value) => updateData({ vaultId: value === 'none' ? undefined : value })}
                    >
                        <SelectTrigger id="vaultId">
                            <SelectValue placeholder="Nenhum vault" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Nenhum vault</SelectItem>
                            {vaults && vaults.length > 0 ? (
                                vaults.map((vault: any) => (
                                    <SelectItem key={vault.id} value={vault.id}>
                                        {vault.name} ({vault.mode})
                                    </SelectItem>
                                ))
                            ) : null}
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-1">
                        Vault para rastrear lucros/perdas separadamente
                    </p>
                </div>

                {/* Preview final */}
                <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-medium mb-3">Preview Final</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Conta:</span>
                            <span className="font-medium">{data.accountId || 'Não selecionada'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Símbolo:</span>
                            <span className="font-medium">{data.symbol || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Lado:</span>
                            <span className="font-medium">{data.side}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Tamanho:</span>
                            <span className="font-medium">
                                {data.orderSizeType === 'PERCENT' ? `${data.orderSizeValue}%` : `$${data.orderSizeValue}`}
                            </span>
                        </div>
                        {data.stopLossPercent && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">SL:</span>
                                <span className="font-medium">{data.stopLossPercent}%</span>
                            </div>
                        )}
                        {data.takeProfitPercent && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">TP:</span>
                                <span className="font-medium">{data.takeProfitPercent}%</span>
                            </div>
                        )}
                        {data.maxDailyTrades && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Limite Diário:</span>
                                <span className="font-medium">{data.maxDailyTrades} trades</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

