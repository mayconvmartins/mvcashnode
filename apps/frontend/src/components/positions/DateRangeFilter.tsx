'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Calendar, X } from 'lucide-react'

export type DatePreset = 'all' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'last90days' | 'thisMonth' | 'lastMonth' | 'custom'

interface DateRangeFilterProps {
    from?: string
    to?: string
    preset?: DatePreset
    onDateChange: (from: string | undefined, to: string | undefined, preset: DatePreset) => void
}

export function DateRangeFilter({ from, to, preset: initialPreset, onDateChange }: DateRangeFilterProps) {
    const [preset, setPreset] = useState<DatePreset>(initialPreset || 'all')
    const [customFrom, setCustomFrom] = useState<string>(from || '')
    const [customTo, setCustomTo] = useState<string>(to || '')

    const getPresetDates = (presetValue: DatePreset): { from: string | undefined; to: string | undefined } => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        
        switch (presetValue) {
            case 'all':
                return { from: undefined, to: undefined }
            
            case 'today':
                const todayStart = new Date(today)
                const todayEnd = new Date(today)
                todayEnd.setHours(23, 59, 59, 999)
                return {
                    from: todayStart.toISOString(),
                    to: todayEnd.toISOString(),
                }
            
            case 'yesterday':
                const yesterday = new Date(today)
                yesterday.setDate(yesterday.getDate() - 1)
                const yesterdayStart = new Date(yesterday)
                const yesterdayEnd = new Date(yesterday)
                yesterdayEnd.setHours(23, 59, 59, 999)
                return {
                    from: yesterdayStart.toISOString(),
                    to: yesterdayEnd.toISOString(),
                }
            
            case 'last7days':
                const last7Days = new Date(today)
                last7Days.setDate(last7Days.getDate() - 7)
                const todayEnd7 = new Date(today)
                todayEnd7.setHours(23, 59, 59, 999)
                return {
                    from: last7Days.toISOString(),
                    to: todayEnd7.toISOString(),
                }
            
            case 'last30days':
                const last30Days = new Date(today)
                last30Days.setDate(last30Days.getDate() - 30)
                const todayEnd30 = new Date(today)
                todayEnd30.setHours(23, 59, 59, 999)
                return {
                    from: last30Days.toISOString(),
                    to: todayEnd30.toISOString(),
                }
            
            case 'last90days':
                const last90Days = new Date(today)
                last90Days.setDate(last90Days.getDate() - 90)
                const todayEnd90 = new Date(today)
                todayEnd90.setHours(23, 59, 59, 999)
                return {
                    from: last90Days.toISOString(),
                    to: todayEnd90.toISOString(),
                }
            
            case 'thisMonth':
                const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
                const thisMonthEnd = new Date(today)
                thisMonthEnd.setHours(23, 59, 59, 999)
                return {
                    from: thisMonthStart.toISOString(),
                    to: thisMonthEnd.toISOString(),
                }
            
            case 'lastMonth':
                const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
                return {
                    from: lastMonthStart.toISOString(),
                    to: lastMonthEnd.toISOString(),
                }
            
            case 'custom':
                return {
                    from: customFrom ? new Date(customFrom).toISOString() : undefined,
                    to: customTo ? new Date(customTo + 'T23:59:59.999').toISOString() : undefined,
                }
            
            default:
                return { from: undefined, to: undefined }
        }
    }

    const handlePresetChange = (newPreset: DatePreset) => {
        setPreset(newPreset)
        const dates = getPresetDates(newPreset)
        onDateChange(dates.from, dates.to, newPreset)
    }

    const handleCustomDateChange = () => {
        if (preset === 'custom') {
            const dates = getPresetDates('custom')
            onDateChange(dates.from, dates.to, 'custom')
        }
    }

    const handleClear = () => {
        setPreset('all')
        setCustomFrom('')
        setCustomTo('')
        onDateChange(undefined, undefined, 'all')
    }

    const hasActiveFilter = preset !== 'all' || from || to

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label>Filtro de Data</Label>
                {hasActiveFilter && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        className="h-6 px-2 text-xs"
                    >
                        <X className="h-3 w-3 mr-1" />
                        Limpar
                    </Button>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                    <Label htmlFor="date-preset">Período</Label>
                    <Select value={preset} onValueChange={handlePresetChange}>
                        <SelectTrigger id="date-preset">
                            <SelectValue placeholder="Selecione um período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os períodos</SelectItem>
                            <SelectItem value="today">Hoje</SelectItem>
                            <SelectItem value="yesterday">Ontem</SelectItem>
                            <SelectItem value="last7days">Últimos 7 dias</SelectItem>
                            <SelectItem value="last30days">Últimos 30 dias</SelectItem>
                            <SelectItem value="last90days">Últimos 90 dias</SelectItem>
                            <SelectItem value="thisMonth">Mês atual</SelectItem>
                            <SelectItem value="lastMonth">Mês anterior</SelectItem>
                            <SelectItem value="custom">Personalizado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {preset === 'custom' && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="date-from">Data Inicial</Label>
                            <Input
                                id="date-from"
                                type="date"
                                value={customFrom}
                                onChange={(e) => {
                                    setCustomFrom(e.target.value)
                                    if (e.target.value && customTo) {
                                        setTimeout(handleCustomDateChange, 100)
                                    }
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="date-to">Data Final</Label>
                            <Input
                                id="date-to"
                                type="date"
                                value={customTo}
                                onChange={(e) => {
                                    setCustomTo(e.target.value)
                                    if (customFrom && e.target.value) {
                                        setTimeout(handleCustomDateChange, 100)
                                    }
                                }}
                                min={customFrom || undefined}
                            />
                        </div>
                    </>
                )}
            </div>

            {preset !== 'custom' && preset !== 'all' && (
                <div className="text-sm text-muted-foreground">
                    {(() => {
                        const dates = getPresetDates(preset)
                        if (dates.from && dates.to) {
                            const fromDate = new Date(dates.from)
                            const toDate = new Date(dates.to)
                            return `${fromDate.toLocaleDateString('pt-BR')} até ${toDate.toLocaleDateString('pt-BR')}`
                        }
                        return ''
                    })()}
                </div>
            )}
        </div>
    )
}

