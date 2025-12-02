'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Search } from 'lucide-react'

interface AuditFiltersProps {
    filters: {
        user: string
        action: string
        dateFrom: string
        dateTo: string
        search: string
    }
    onFilterChange: (key: string, value: string) => void
}

export function AuditFilters({ filters, onFilterChange }: AuditFiltersProps) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
                        <Label htmlFor="action">Ação</Label>
                        <Select value={filters.action} onValueChange={(value) => onFilterChange('action', value)}>
                            <SelectTrigger id="action">
                                <SelectValue placeholder="Todas" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas</SelectItem>
                                <SelectItem value="CREATE">Criar</SelectItem>
                                <SelectItem value="UPDATE">Atualizar</SelectItem>
                                <SelectItem value="DELETE">Deletar</SelectItem>
                                <SelectItem value="LOGIN">Login</SelectItem>
                                <SelectItem value="LOGOUT">Logout</SelectItem>
                                <SelectItem value="FAILED_LOGIN">Login Falhou</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="user">Usuário</Label>
                        <Select value={filters.user} onValueChange={(value) => onFilterChange('user', value)}>
                            <SelectTrigger id="user">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                {/* Aqui poderia buscar lista de usuários dinamicamente */}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="dateFrom">Data Inicial</Label>
                        <Input
                            id="dateFrom"
                            type="date"
                            value={filters.dateFrom}
                            onChange={(e) => onFilterChange('dateFrom', e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="dateTo">Data Final</Label>
                        <Input
                            id="dateTo"
                            type="date"
                            value={filters.dateTo}
                            onChange={(e) => onFilterChange('dateTo', e.target.value)}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

