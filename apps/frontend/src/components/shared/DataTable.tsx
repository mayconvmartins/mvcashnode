'use client'

import { useState } from 'react'
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
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

export interface Column<T> {
    key: string
    label: string
    render?: (item: T) => React.ReactNode
    sortable?: boolean
    className?: string
}

interface DataTableProps<T> {
    data: T[]
    columns: Column<T>[]
    loading?: boolean
    pagination?: boolean
    pageSize?: number
    currentPage?: number
    totalPages?: number
    onPageChange?: (page: number) => void
    emptyState?: React.ReactNode
    filters?: React.ReactNode
    actions?: (item: T) => React.ReactNode
    onRowClick?: (item: T) => void
    className?: string
}

export function DataTable<T extends { id?: number | string }>({
    data,
    columns,
    loading = false,
    pagination = false,
    pageSize = 10,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    emptyState,
    filters,
    actions,
    onRowClick,
    className,
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

    const sortedData = [...data].sort((a, b) => {
        if (!sortColumn) return 0

        const aValue = (a as any)[sortColumn]
        const bValue = (b as any)[sortColumn]

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
        return 0
    })

    if (loading) {
        return (
            <div className={cn('space-y-4', className)}>
                {filters && <div className="mb-4">{filters}</div>}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {columns.map((column) => (
                                    <TableHead key={column.key}>{column.label}</TableHead>
                                ))}
                                {actions && <TableHead>Ações</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array.from({ length: pageSize }).map((_, i) => (
                                <TableRow key={i}>
                                    {columns.map((column) => (
                                        <TableCell key={column.key}>
                                            <Skeleton className="h-4 w-full" />
                                        </TableCell>
                                    ))}
                                    {actions && (
                                        <TableCell>
                                            <Skeleton className="h-8 w-20" />
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

    if (data.length === 0 && !loading) {
        return (
            <div className={cn('space-y-4', className)}>
                {filters && <div className="mb-4">{filters}</div>}
                <div className="rounded-md border p-8">
                    {emptyState || (
                        <div className="text-center text-muted-foreground">
                            <p className="text-lg font-medium">Nenhum dado encontrado</p>
                            <p className="text-sm mt-1">
                                Tente ajustar os filtros ou adicionar novos itens
                            </p>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className={cn('space-y-4', className)}>
            {filters && <div className="mb-4">{filters}</div>}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead
                                    key={column.key}
                                    className={cn(column.className, column.sortable && 'cursor-pointer')}
                                    onClick={() => column.sortable && handleSort(column.key)}
                                >
                                    <div className="flex items-center gap-2">
                                        {column.label}
                                        {column.sortable && sortColumn === column.key && (
                                            <span className="text-xs">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </TableHead>
                            ))}
                            {actions && <TableHead>Ações</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedData.map((item, index) => (
                            <TableRow
                                key={item.id || index}
                                className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
                                onClick={() => onRowClick?.(item)}
                            >
                                {columns.map((column) => (
                                    <TableCell key={column.key} className={column.className}>
                                        {column.render
                                            ? column.render(item)
                                            : (item as any)[column.key]}
                                    </TableCell>
                                ))}
                                {actions && (
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        {actions(item)}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {pagination && totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Página {currentPage} de {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => onPageChange?.(1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => onPageChange?.(currentPage - 1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => onPageChange?.(currentPage + 1)}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => onPageChange?.(totalPages)}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

