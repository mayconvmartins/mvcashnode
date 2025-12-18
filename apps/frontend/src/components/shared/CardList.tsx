'use client'

import { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CardField<T> {
    key: string
    label: string
    render?: (item: T) => ReactNode
    className?: string
    primary?: boolean
    secondary?: boolean
}

interface ActionItem<T> {
    label: string
    icon?: ReactNode
    onClick: (item: T) => void
    variant?: 'default' | 'destructive'
}

interface CardListProps<T> {
    data: T[]
    fields: CardField<T>[]
    loading?: boolean
    emptyState?: ReactNode
    actions?: ActionItem<T>[]
    onCardClick?: (item: T) => void
    pagination?: boolean
    currentPage?: number
    totalPages?: number
    onPageChange?: (page: number) => void
    className?: string
    cardClassName?: string
}

export function CardList<T extends { id?: number | string }>({
    data,
    fields,
    loading = false,
    emptyState,
    actions,
    onCardClick,
    pagination = false,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    className,
    cardClassName,
}: CardListProps<T>) {
    const safeData = Array.isArray(data) ? data : []
    
    const primaryField = fields.find(f => f.primary)
    const secondaryField = fields.find(f => f.secondary)
    const otherFields = fields.filter(f => !f.primary && !f.secondary)

    if (loading) {
        return (
            <div className={cn('space-y-3', className)}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className={cardClassName}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2 flex-1">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-4 w-24" />
                                </div>
                                <Skeleton className="h-8 w-8 rounded-full" />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <Skeleton className="h-10" />
                                <Skeleton className="h-10" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    if (safeData.length === 0) {
        return (
            <div className={cn('space-y-4', className)}>
                <Card className="p-8">
                    {emptyState || (
                        <div className="text-center text-muted-foreground">
                            <p className="text-lg font-medium">Nenhum item encontrado</p>
                            <p className="text-sm mt-1">
                                Tente ajustar os filtros ou adicionar novos itens
                            </p>
                        </div>
                    )}
                </Card>
            </div>
        )
    }

    return (
        <div className={cn('space-y-3', className)}>
            {safeData.map((item, index) => (
                <Card 
                    key={item.id || index} 
                    className={cn(
                        'overflow-hidden transition-all active:scale-[0.99]',
                        onCardClick && 'cursor-pointer hover:shadow-md',
                        cardClassName
                    )}
                    onClick={() => onCardClick?.(item)}
                >
                    <CardContent className="p-4">
                        {/* Header with primary info and actions */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                {primaryField && (
                                    <div className={cn('font-semibold text-base truncate', primaryField.className)}>
                                        {primaryField.render 
                                            ? primaryField.render(item) 
                                            : (item as any)[primaryField.key]}
                                    </div>
                                )}
                                {secondaryField && (
                                    <div className={cn('text-sm text-muted-foreground mt-0.5', secondaryField.className)}>
                                        {secondaryField.render 
                                            ? secondaryField.render(item) 
                                            : (item as any)[secondaryField.key]}
                                    </div>
                                )}
                            </div>
                            
                            {actions && actions.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {actions.map((action, i) => (
                                            <DropdownMenuItem
                                                key={i}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    action.onClick(item)
                                                }}
                                                className={action.variant === 'destructive' ? 'text-destructive' : ''}
                                            >
                                                {action.icon && <span className="mr-2">{action.icon}</span>}
                                                {action.label}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>

                        {/* Other fields in a grid */}
                        {otherFields.length > 0 && (
                            <div className={cn(
                                'mt-3 pt-3 border-t border-border/50',
                                'grid gap-3',
                                otherFields.length === 1 ? 'grid-cols-1' : 
                                otherFields.length === 2 ? 'grid-cols-2' :
                                otherFields.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                            )}>
                                {otherFields.map((field) => (
                                    <div key={field.key} className={field.className}>
                                        <p className="text-xs text-muted-foreground">{field.label}</p>
                                        <p className="text-sm font-medium mt-0.5 truncate">
                                            {field.render 
                                                ? field.render(item) 
                                                : (item as any)[field.key] || '-'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            {/* Pagination - Simplified for mobile */}
            {pagination && totalPages > 1 && (
                <div className="flex items-center justify-between py-4">
                    <span className="text-sm text-muted-foreground">
                        {currentPage} / {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange?.(currentPage - 1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Anterior
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange?.(currentPage + 1)}
                            disabled={currentPage === totalPages}
                        >
                            Próximo
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

// Empty state component for consistent styling
interface EmptyStateProps {
    icon?: ReactNode
    title: string
    description?: string
    action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            {icon && (
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    {icon}
                </div>
            )}
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && (
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}

