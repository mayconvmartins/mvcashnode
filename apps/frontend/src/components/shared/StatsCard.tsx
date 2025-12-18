'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
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
    description?: string
    variant?: 'default' | 'gradient' | 'minimal'
    size?: 'sm' | 'md' | 'lg'
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
    description,
    variant = 'default',
    size = 'md',
}: StatsCardProps) {
    const getTrendInfo = () => {
        const isPositive = trend === 'up' || (change !== undefined && change > 0)
        const isNegative = trend === 'down' || (change !== undefined && change < 0)
        
        if (isPositive) {
            return { 
                color: 'text-emerald-500', 
                bgColor: 'bg-emerald-500/10',
                Icon: TrendingUp 
            }
        }
        if (isNegative) {
            return { 
                color: 'text-red-500', 
                bgColor: 'bg-red-500/10',
                Icon: TrendingDown 
            }
        }
        return { 
            color: 'text-muted-foreground', 
            bgColor: 'bg-muted/10',
            Icon: Minus 
        }
    }

    const formatValue = (val: string | number) => {
        if (typeof val === 'number') {
            if (formatAsCurrency) {
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }).format(val)
            } else {
                return new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                }).format(val)
            }
        }
        return val
    }

    const sizeClasses = {
        sm: {
            card: 'p-4',
            title: 'text-xs',
            value: 'text-lg',
            icon: 'h-8 w-8',
            iconInner: 'h-4 w-4',
        },
        md: {
            card: 'p-5',
            title: 'text-sm',
            value: 'text-2xl',
            icon: 'h-10 w-10',
            iconInner: 'h-5 w-5',
        },
        lg: {
            card: 'p-6',
            title: 'text-base',
            value: 'text-3xl',
            icon: 'h-12 w-12',
            iconInner: 'h-6 w-6',
        },
    }

    const sizes = sizeClasses[size]
    const trendInfo = getTrendInfo()

    if (loading) {
        return (
            <Card className={cn('overflow-hidden', className)}>
                <CardContent className={sizes.card}>
                    <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-8 w-32" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                        <Skeleton className={cn('rounded-xl', sizes.icon)} />
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (variant === 'gradient') {
        return (
            <Card className={cn(
                'overflow-hidden relative group transition-all duration-300',
                'hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5',
                className
            )}>
                {/* Gradient Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50 group-hover:opacity-100 transition-opacity" />
                
                <CardContent className={cn('relative', sizes.card)}>
                    <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                            <p className={cn('font-medium text-muted-foreground', sizes.title)}>
                                {title}
                            </p>
                            <p className={cn('font-bold tracking-tight', sizes.value)}>
                                {formatValue(value)}
                            </p>
                            {description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                    {description}
                                </p>
                            )}
                            {change !== undefined && (
                                <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', trendInfo.bgColor, trendInfo.color)}>
                                    <trendInfo.Icon className="h-3 w-3" />
                                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                                </div>
                            )}
                        </div>
                        {Icon && (
                            <div className={cn(
                                'rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center',
                                sizes.icon
                            )}>
                                <Icon className={cn('text-primary', sizes.iconInner)} />
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (variant === 'minimal') {
        return (
            <div className={cn('space-y-1', className)}>
                <p className={cn('font-medium text-muted-foreground', sizes.title)}>
                    {title}
                </p>
                <div className="flex items-baseline gap-2">
                    <p className={cn('font-bold tracking-tight', sizes.value)}>
                        {formatValue(value)}
                    </p>
                    {change !== undefined && (
                        <span className={cn('text-xs font-medium', trendInfo.color)}>
                            {change > 0 ? '+' : ''}{change.toFixed(2)}%
                        </span>
                    )}
                </div>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </div>
        )
    }

    // Default variant
    return (
        <Card className={cn(
            'overflow-hidden transition-all duration-300',
            'hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5',
            'border-border/50',
            className
        )}>
            <CardContent className={sizes.card}>
                <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                        <p className={cn('font-medium text-muted-foreground truncate', sizes.title)}>
                            {title}
                        </p>
                        <p className={cn('font-bold tracking-tight tabular-nums', sizes.value)}>
                            {formatValue(value)}
                        </p>
                        {description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                                {description}
                            </p>
                        )}
                        {change !== undefined && (
                            <div className={cn('inline-flex items-center gap-1 text-xs font-medium', trendInfo.color)}>
                                <trendInfo.Icon className="h-3 w-3" />
                                {change > 0 ? '+' : ''}{change.toFixed(2)}%
                            </div>
                        )}
                    </div>
                    {Icon && (
                        <div className={cn(
                            'rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 ml-3',
                            sizes.icon
                        )}>
                            <Icon className={cn('text-primary', sizes.iconInner)} />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

// Grid wrapper for stats cards
interface StatsGridProps {
    children: React.ReactNode
    columns?: 1 | 2 | 3 | 4
    className?: string
}

export function StatsGrid({ children, columns = 4, className }: StatsGridProps) {
    const gridCols = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    }

    return (
        <div className={cn('grid gap-4', gridCols[columns], className)}>
            {children}
        </div>
    )
}

// Skeleton for loading state
export function StatsCardSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizeClasses = {
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6',
    }

    return (
        <Card>
            <CardContent className={sizeClasses[size]}>
                <div className="flex items-start justify-between animate-pulse">
                    <div className="space-y-3 flex-1">
                        <div className="h-3 w-20 bg-muted rounded" />
                        <div className="h-7 w-28 bg-muted rounded" />
                        <div className="h-3 w-16 bg-muted rounded" />
                    </div>
                    <div className="h-10 w-10 bg-muted rounded-xl" />
                </div>
            </CardContent>
        </Card>
    )
}
