'use client'

import { useQuery } from '@tanstack/react-query'
import { accountsService } from '@/lib/api/accounts.service'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface WizardStepAccountProps {
    data: any
    updateData: (data: any) => void
}

export function WizardStepAccount({ data, updateData }: WizardStepAccountProps) {
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-4">Conta e Símbolo</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    Selecione a conta de exchange e configure o par de trading
                </p>
            </div>

            <div className="space-y-4">
                <div>
                    <Label htmlFor="accountId">Conta *</Label>
                    <Select value={data.accountId} onValueChange={(value) => updateData({ accountId: value })}>
                        <SelectTrigger id="accountId">
                            <SelectValue placeholder="Selecione uma conta" />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts && accounts.length > 0 ? (
                                accounts.map((account: any) => (
                                    <SelectItem key={account.id} value={String(account.id)}>
                                        {account.label} ({account.exchange})
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled>
                                    Nenhuma conta disponível
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="symbol">Símbolo *</Label>
                    <Input
                        id="symbol"
                        value={data.symbol}
                        onChange={(e) => updateData({ symbol: e.target.value.toUpperCase() })}
                        placeholder="Ex: BTCUSDT"
                        required
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                        Par de trading (formato da exchange)
                    </p>
                </div>

                <div>
                    <Label htmlFor="side">Lado *</Label>
                    <Select value={data.side} onValueChange={(value) => updateData({ side: value })}>
                        <SelectTrigger id="side">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="BUY">BUY (Long)</SelectItem>
                            <SelectItem value="SELL">SELL (Short)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    )
}

