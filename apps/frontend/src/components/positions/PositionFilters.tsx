'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Search } from 'lucide-react'

interface PositionFiltersProps {
    filters: {
        search: string
        status: string
        account: string
        symbol: string
    }
    onFilterChange: (key: string, value: string) => void
    accounts?: any[]
    symbols?: string[]
}

export function PositionFilters({ filters, onFilterChange, accounts = [], symbols = [] }: PositionFiltersProps) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                        <Label htmlFor="search">Buscar</Label>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="search"
                                placeholder="Buscar posição..."
                                value={filters.search}
                                onChange={(e) => onFilterChange('search', e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select value={filters.status} onValueChange={(value) => onFilterChange('status', value)}>
                            <SelectTrigger id="status">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="OPEN">Abertas</SelectItem>
                                <SelectItem value="CLOSED">Fechadas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="account">Conta</Label>
                        <Select value={filters.account} onValueChange={(value) => onFilterChange('account', value)}>
                            <SelectTrigger id="account">
                                <SelectValue placeholder="Todas" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas</SelectItem>
                                {accounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="symbol">Símbolo</Label>
                        <Select value={filters.symbol} onValueChange={(value) => onFilterChange('symbol', value)}>
                            <SelectTrigger id="symbol">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                {symbols.map((symbol) => (
                                    <SelectItem key={symbol} value={symbol}>
                                        {symbol}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

