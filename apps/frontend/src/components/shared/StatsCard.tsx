'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'

interface StatsCardProps {
    title: string
    value: string | number
    change?: number
    icon?: LucideIcon
    loading?: boolean
    className?: string
    trend?: 'up' | 'down' | 'neutral'
    formatAsCurrency?: boolean
}

export function StatsCard({
    title,
    value,
    change,
    icon: Icon,
    loading = false,
    className,
    trend,
    formatAsCurrency = true,
}: StatsCardProps) {
    const getTrendColor = () => {
        if (trend === 'up' || (change !== undefined && change > 0)) {
            return 'text-success'
        }
        if (trend === 'down' || (change !== undefined && change < 0)) {
            return 'text-destructive'
        }
        return 'text-muted-foreground'
    }

    const formatValue = (val: string | number) => {
        if (typeof val === 'number') {
            if (formatAsCurrency) {
                return new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }).format(val)
            } else {
                // Formatar como número inteiro se for um contador
                return new Intl.NumberFormat('pt-BR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                }).format(val)
            }
        }
        return val
    }

    if (loading) {
        return (
            <Card className={cn('glass', className)}>
                <CardContent className="p-6">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-32 mb-2" />
                    {change !== undefined && <Skeleton className="h-4 w-20" />}
                </CardContent>
            </Card>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <Card className={cn('glass hover-lift', className)}>
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        {Icon && (
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Icon className="h-4 w-4 text-primary" />
                            </div>
                        )}
                    </div>
                    <div className="space-y-1">
                        <p className="text-2xl font-bold font-mono">{formatValue(value)}</p>
                        {change !== undefined && (
                            <p className={cn('text-sm font-medium', getTrendColor())}>
                                {change > 0 ? '+' : ''}
                                {change.toFixed(2)}%
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}

