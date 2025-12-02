'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Filter, X } from 'lucide-react'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'

export interface OrderFilterValues {
    symbol?: string
    side?: 'BUY' | 'SELL' | ''
    status?: 'PENDING' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | ''
    accountId?: number | ''
}

interface OrderFiltersProps {
    filters: OrderFilterValues
    onFiltersChange: (filters: OrderFilterValues) => void
    accounts?: Array<{ id: number; label: string }>
}

export function OrderFilters({ filters, onFiltersChange, accounts = [] }: OrderFiltersProps) {
    const [isOpen, setIsOpen] = useState(false)
    const activeFiltersCount = Object.values(filters).filter((v) => v !== '' && v !== undefined).length

    const handleClearFilters = () => {
        onFiltersChange({
            symbol: '',
            side: '',
            status: '',
            accountId: '',
        })
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                    <Filter className="h-4 w-4 mr-2" />
                    Filtros
                    {activeFiltersCount > 0 && (
                        <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                            {activeFiltersCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-medium">Filtros</h4>
                        {activeFiltersCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearFilters}
                                className="h-8 text-xs"
                            >
                                <X className="h-3 w-3 mr-1" />
                                Limpar
                            </Button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {/* Symbol */}
                        <div className="space-y-1">
                            <Label htmlFor="symbol">Símbolo</Label>
                            <Input
                                id="symbol"
                                placeholder="Ex: BTCUSDT"
                                value={filters.symbol || ''}
                                onChange={(e) =>
                                    onFiltersChange({ ...filters, symbol: e.target.value })
                                }
                            />
                        </div>

                        {/* Side */}
                        <div className="space-y-1">
                            <Label htmlFor="side">Lado</Label>
                            <Select
                                value={filters.side || ''}
                                onValueChange={(value) =>
                                    onFiltersChange({ ...filters, side: value as any })
                                }
                            >
                                <SelectTrigger id="side">
                                    <SelectValue placeholder="Selecione o lado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">Todos</SelectItem>
                                    <SelectItem value="BUY">Compra</SelectItem>
                                    <SelectItem value="SELL">Venda</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status */}
                        <div className="space-y-1">
                            <Label htmlFor="status">Status</Label>
                            <Select
                                value={filters.status || ''}
                                onValueChange={(value) =>
                                    onFiltersChange({ ...filters, status: value as any })
                                }
                            >
                                <SelectTrigger id="status">
                                    <SelectValue placeholder="Selecione o status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">Todos</SelectItem>
                                    <SelectItem value="PENDING">Pendente</SelectItem>
                                    <SelectItem value="FILLED">Executada</SelectItem>
                                    <SelectItem value="CANCELLED">Cancelada</SelectItem>
                                    <SelectItem value="EXPIRED">Expirada</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Account */}
                        {accounts.length > 0 && (
                            <div className="space-y-1">
                                <Label htmlFor="account">Conta</Label>
                                <Select
                                    value={filters.accountId?.toString() || ''}
                                    onValueChange={(value) =>
                                        onFiltersChange({
                                            ...filters,
                                            accountId: value ? parseInt(value) : '',
                                        })
                                    }
                                >
                                    <SelectTrigger id="account">
                                        <SelectValue placeholder="Selecione a conta" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">Todas</SelectItem>
                                        {accounts.map((account) => (
                                            <SelectItem key={account.id} value={account.id.toString()}>
                                                {account.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <Button
                        className="w-full"
                        onClick={() => setIsOpen(false)}
                    >
                        Aplicar Filtros
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
