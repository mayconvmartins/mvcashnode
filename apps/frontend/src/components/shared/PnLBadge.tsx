'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface PnLBadgeProps {
    value: number
    showIcon?: boolean
    className?: string
    format?: 'currency' | 'percentage' | 'number'
}

export function PnLBadge({ value, showIcon = true, className, format = 'currency' }: PnLBadgeProps) {
    const isPositive = value >= 0
    const isZero = value === 0

    const formatValue = () => {
        if (format === 'currency') {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(value)
        }
        if (format === 'percentage') {
            return `${isPositive ? '+' : ''}${value.toFixed(2)}%`
        }
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value)
    }

    return (
        <Badge
            variant={isZero ? 'secondary' : isPositive ? 'success' : 'destructive'}
            className={cn('font-mono gap-1', className)}
        >
            {showIcon && !isZero && (
                <>
                    {isPositive ? (
                        <TrendingUp className="h-3 w-3" />
                    ) : (
                        <TrendingDown className="h-3 w-3" />
                    )}
                </>
            )}
            {formatValue()}
        </Badge>
    )
}

