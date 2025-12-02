'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Search } from 'lucide-react'

interface EventFiltersProps {
    filters: {
        source: string
        status: string
        search: string
    }
    onFilterChange: (key: string, value: string) => void
}

export function EventFilters({ filters, onFilterChange }: EventFiltersProps) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="search">Buscar</Label>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="search"
                                placeholder="Buscar evento..."
                                value={filters.search}
                                onChange={(e) => onFilterChange('search', e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="source">Source</Label>
                        <Select value={filters.source} onValueChange={(value) => onFilterChange('source', value)}>
                            <SelectTrigger id="source">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="TRADINGVIEW">TradingView</SelectItem>
                                <SelectItem value="CUSTOM">Custom</SelectItem>
                                <SelectItem value="TELEGRAM">Telegram</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select value={filters.status} onValueChange={(value) => onFilterChange('status', value)}>
                            <SelectTrigger id="status">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="processed">Processados</SelectItem>
                                <SelectItem value="pending">Pendentes</SelectItem>
                                <SelectItem value="error">Com Erro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

