'use client'

import { useState, ReactNode } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { 
    ChevronLeft, 
    ChevronRight, 
    ChevronsLeft, 
    ChevronsRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    MoreHorizontal,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface Column<T> {
    key: string
    label: string | ((data: T[]) => string)
    render?: (item: T) => React.ReactNode
    sortable?: boolean
    className?: string
    headerClassName?: string
    align?: 'left' | 'center' | 'right'
    width?: string
    hideOnMobile?: boolean
}

export interface ActionItem<T> {
    label: string
    icon?: ReactNode
    onClick: (item: T) => void
    variant?: 'default' | 'destructive'
    hidden?: (item: T) => boolean
}

interface DataTableProps<T> {
    data: T[]
    columns: Column<T>[]
    loading?: boolean
    pagination?: boolean
    pageSize?: number
    currentPage?: number
    totalPages?: number
    totalItems?: number
    onPageChange?: (page: number) => void
    emptyState?: React.ReactNode
    emptyIcon?: React.ReactNode
    emptyTitle?: string
    emptyDescription?: string
    filters?: React.ReactNode
    actions?: ActionItem<T>[] | ((item: T) => React.ReactNode)
    onRowClick?: (item: T) => void
    className?: string
    stickyHeader?: boolean
    striped?: boolean
    compact?: boolean
    rowClassName?: (item: T) => string
}

export function DataTable<T extends { id?: number | string }>({
    data,
    columns,
    loading = false,
    pagination = false,
    pageSize = 10,
    currentPage = 1,
    totalPages = 1,
    totalItems,
    onPageChange,
    emptyState,
    emptyIcon,
    emptyTitle = 'Nenhum dado encontrado',
    emptyDescription = 'Tente ajustar os filtros ou adicionar novos itens',
    filters,
    actions,
    onRowClick,
    className,
    stickyHeader = false,
    striped = false,
    compact = false,
    rowClassName,
}: DataTableProps<T>) {
    const [sortColumn, setSortColumn] = useState<string | null>(null)
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

    const handleSort = (columnKey: string) => {
        if (sortColumn === columnKey) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortColumn(columnKey)
            setSortDirection('asc')
        }
    }

    const safeData = Array.isArray(data) ? data : []

    const sortedData = [...safeData].sort((a, b) => {
        if (!sortColumn) return 0

        const aValue = (a as any)[sortColumn]
        const bValue = (b as any)[sortColumn]

        // Tratar valores nulos/undefined
        if (aValue === null || aValue === undefined) return 1
        if (bValue === null || bValue === undefined) return -1

        // Tratar números
        if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
        }

        // Tratar strings
        const aStr = String(aValue).toLowerCase()
        const bStr = String(bValue).toLowerCase()
        
        if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1
        if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1
        return 0
    })

    const visibleColumns = columns.filter(col => !col.hideOnMobile || window.innerWidth >= 768)
    const hasActions = actions !== undefined

    const renderSortIcon = (column: Column<T>) => {
        if (!column.sortable) return null
        
        if (sortColumn === column.key) {
            return sortDirection === 'asc' 
                ? <ArrowUp className="h-4 w-4 ml-1" />
                : <ArrowDown className="h-4 w-4 ml-1" />
        }
        return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />
    }

    const renderActions = (item: T) => {
        if (!actions) return null
        
        if (typeof actions === 'function') {
            return actions(item)
        }

        const visibleActions = actions.filter(action => !action.hidden || !action.hidden(item))
        
        if (visibleActions.length === 0) return null
        
        if (visibleActions.length <= 2) {
            return (
                <div className="flex items-center gap-1">
                    {visibleActions.map((action, i) => (
                        <Button
                            key={i}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'h-8 px-2',
                                action.variant === 'destructive' && 'text-destructive hover:text-destructive'
                            )}
                            onClick={(e) => {
                                e.stopPropagation()
                                action.onClick(item)
                            }}
                        >
                            {action.icon}
                            <span className="ml-1 hidden sm:inline">{action.label}</span>
                        </Button>
                    ))}
                </div>
            )
        }

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {visibleActions.map((action, i) => (
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
        )
    }

    if (loading) {
        return (
            <div className={cn('space-y-4', className)}>
                {filters && <div className="mb-4">{filters}</div>}
                <div className="rounded-xl border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                {columns.map((column) => (
                                    <TableHead key={column.key} className={column.headerClassName}>
                                        {typeof column.label === 'function' ? column.label(safeData) : column.label}
                                    </TableHead>
                                ))}
                                {hasActions && <TableHead className="w-[100px]">Ações</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array.from({ length: pageSize }).map((_, i) => (
                                <TableRow key={i}>
                                    {columns.map((column) => (
                                        <TableCell key={column.key} className={compact ? 'py-2' : 'py-3'}>
                                            <Skeleton className="h-4 w-full max-w-[200px]" />
                                        </TableCell>
                                    ))}
                                    {hasActions && (
                                        <TableCell className={compact ? 'py-2' : 'py-3'}>
                                            <Skeleton className="h-8 w-16" />
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        )
    }

    if (safeData.length === 0 && !loading) {
        return (
            <div className={cn('space-y-4', className)}>
                {filters && <div className="mb-4">{filters}</div>}
                <div className="rounded-xl border p-8">
                    {emptyState || (
                        <div className="flex flex-col items-center justify-center text-center">
                            {emptyIcon && (
                                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                    {emptyIcon}
                                </div>
                            )}
                            <p className="text-lg font-medium">{emptyTitle}</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                {emptyDescription}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    const startItem = (currentPage - 1) * pageSize + 1
    const endItem = Math.min(currentPage * pageSize, totalItems || safeData.length)

    return (
        <div className={cn('space-y-4', className)}>
            {filters && <div className="mb-4">{filters}</div>}
            <div className={cn(
                'rounded-xl border overflow-hidden',
                stickyHeader && 'max-h-[calc(100vh-300px)] overflow-auto'
            )}>
                <Table>
                    <TableHeader className={stickyHeader ? 'sticky top-0 bg-card z-10' : ''}>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            {columns.map((column) => (
                                <TableHead
                                    key={column.key}
                                    style={{ width: column.width }}
                                    className={cn(
                                        column.headerClassName,
                                        column.sortable && 'cursor-pointer select-none hover:bg-muted/50',
                                        column.align === 'center' && 'text-center',
                                        column.align === 'right' && 'text-right',
                                        column.hideOnMobile && 'hidden md:table-cell'
                                    )}
                                    onClick={() => column.sortable && handleSort(column.key)}
                                >
                                    <div className={cn(
                                        'flex items-center',
                                        column.align === 'center' && 'justify-center',
                                        column.align === 'right' && 'justify-end'
                                    )}>
                                        {typeof column.label === 'function' ? column.label(safeData) : column.label}
                                        {renderSortIcon(column)}
                                    </div>
                                </TableHead>
                            ))}
                            {hasActions && <TableHead className="w-[100px]">Ações</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedData.map((item, index) => (
                            <TableRow
                                key={item.id || index}
                                className={cn(
                                    'transition-colors',
                                    onRowClick && 'cursor-pointer',
                                    striped && index % 2 === 1 && 'bg-muted/20',
                                    rowClassName && rowClassName(item)
                                )}
                                onClick={() => onRowClick?.(item)}
                            >
                                {columns.map((column) => (
                                    <TableCell 
                                        key={column.key} 
                                        className={cn(
                                            column.className,
                                            compact ? 'py-2' : 'py-3',
                                            column.align === 'center' && 'text-center',
                                            column.align === 'right' && 'text-right',
                                            column.hideOnMobile && 'hidden md:table-cell'
                                        )}
                                    >
                                        {column.render
                                            ? column.render(item)
                                            : (item as any)[column.key]}
                                    </TableCell>
                                ))}
                                {hasActions && (
                                    <TableCell 
                                        className={compact ? 'py-2' : 'py-3'}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {renderActions(item)}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {pagination && totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground order-2 sm:order-1">
                        {totalItems ? (
                            <>Mostrando {startItem}-{endItem} de {totalItems}</>
                        ) : (
                            <>Página {currentPage} de {totalPages}</>
                        )}
                    </div>
                    <div className="flex items-center gap-1 order-1 sm:order-2">
                        {/* Desktop pagination */}
                        <div className="hidden sm:flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onPageChange?.(1)}
                                disabled={currentPage === 1}
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onPageChange?.(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            
                            {/* Page numbers */}
                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum: number
                                    if (totalPages <= 5) {
                                        pageNum = i + 1
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i
                                    } else {
                                        pageNum = currentPage - 2 + i
                                    }
                                    
                                    return (
                                        <Button
                                            key={pageNum}
                                            variant={currentPage === pageNum ? 'default' : 'outline'}
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => onPageChange?.(pageNum)}
                                        >
                                            {pageNum}
                                        </Button>
                                    )
                                })}
                            </div>
                            
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onPageChange?.(currentPage + 1)}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onPageChange?.(totalPages)}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Mobile pagination */}
                        <div className="flex sm:hidden items-center gap-2">
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
                </div>
            )}
        </div>
    )
}
