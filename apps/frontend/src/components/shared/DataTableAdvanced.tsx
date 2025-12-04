'use client'

import { useState, useMemo } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Search,
    X,
} from 'lucide-react'

export interface Column<T> {
    key: string
    label: string
    render?: (item: T) => React.ReactNode
    sortable?: boolean
    filterable?: boolean
    className?: string
}

export type SortDirection = 'asc' | 'desc' | null

interface DataTableAdvancedProps<T> {
    data: T[]
    columns: Column<T>[]
    loading?: boolean
    // Pagination
    pagination?: boolean
    pageSize?: number
    // Sorting
    enableSorting?: boolean
    defaultSortKey?: string
    defaultSortDirection?: SortDirection
    // Search
    enableSearch?: boolean
    searchPlaceholder?: string
    // Selection
    enableSelection?: boolean
    selectedIds?: (string | number)[]
    onSelectionChange?: (ids: (string | number)[]) => void
    // Bulk Actions
    bulkActions?: (selectedIds: (string | number)[]) => React.ReactNode
    // Others
    emptyState?: React.ReactNode
    onRowClick?: (item: T) => void
    className?: string
    getRowId?: (item: T) => string | number
}

export function DataTableAdvanced<T extends Record<string, any>>({
    data,
    columns,
    loading = false,
    pagination = true,
    pageSize: initialPageSize = 10,
    enableSorting = true,
    defaultSortKey,
    defaultSortDirection = 'asc',
    enableSearch = true,
    searchPlaceholder = 'Buscar...',
    enableSelection = false,
    selectedIds = [],
    onSelectionChange,
    bulkActions,
    emptyState,
    onRowClick,
    className,
    getRowId = (item) => item.id,
}: DataTableAdvancedProps<T>) {
    // State
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(initialPageSize)
    const [sortKey, setSortKey] = useState<string | null>(defaultSortKey || null)
    const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection)
    const [searchTerm, setSearchTerm] = useState('')
    const [internalSelectedIds, setInternalSelectedIds] = useState<(string | number)[]>(selectedIds)

    // Use controlled selection if provided, otherwise internal
    const currentSelectedIds = onSelectionChange ? selectedIds : internalSelectedIds
    const handleSelectionChange = onSelectionChange || setInternalSelectedIds

    // Filtering (search)
    const filteredData = useMemo(() => {
        if (!enableSearch || !searchTerm.trim()) return data

        return data.filter((item) => {
            return columns.some((column) => {
                const value = item[column.key]
                if (value === null || value === undefined) return false
                return String(value).toLowerCase().includes(searchTerm.toLowerCase())
            })
        })
    }, [data, searchTerm, columns, enableSearch])

    // Sorting
    const sortedData = useMemo(() => {
        if (!enableSorting || !sortKey || !sortDirection) return filteredData

        return [...filteredData].sort((a, b) => {
            const aValue = a[sortKey]
            const bValue = b[sortKey]

            if (aValue === bValue) return 0
            if (aValue === null || aValue === undefined) return 1
            if (bValue === null || bValue === undefined) return -1

            const comparison = aValue < bValue ? -1 : 1
            return sortDirection === 'asc' ? comparison : -comparison
        })
    }, [filteredData, sortKey, sortDirection, enableSorting])

    // Pagination
    const totalPages = pagination ? Math.ceil(sortedData.length / pageSize) : 1
    const paginatedData = pagination
        ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
        : sortedData

    // Handle sort
    const handleSort = (key: string) => {
        if (!enableSorting) return

        if (sortKey === key) {
            if (sortDirection === 'asc') {
                setSortDirection('desc')
            } else if (sortDirection === 'desc') {
                setSortKey(null)
                setSortDirection(null)
            }
        } else {
            setSortKey(key)
            setSortDirection('asc')
        }
    }

    // Handle selection
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allIds = paginatedData.map(getRowId)
            handleSelectionChange([...new Set([...currentSelectedIds, ...allIds])])
        } else {
            const pageIds = paginatedData.map(getRowId)
            handleSelectionChange(currentSelectedIds.filter((id) => !pageIds.includes(id)))
        }
    }

    const handleSelectRow = (id: string | number, checked: boolean) => {
        if (checked) {
            handleSelectionChange([...currentSelectedIds, id])
        } else {
            handleSelectionChange(currentSelectedIds.filter((selectedId) => selectedId !== id))
        }
    }

    const isAllSelected = paginatedData.length > 0 && paginatedData.every((item) =>
        currentSelectedIds.includes(getRowId(item))
    )
    const isSomeSelected = paginatedData.some((item) =>
        currentSelectedIds.includes(getRowId(item))
    ) && !isAllSelected

    // Render sort icon
    const renderSortIcon = (columnKey: string) => {
        if (sortKey !== columnKey) {
            return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
        }
        if (sortDirection === 'asc') {
            return <ArrowUp className="ml-2 h-4 w-4" />
        }
        return <ArrowDown className="ml-2 h-4 w-4" />
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-[400px] w-full" />
            </div>
        )
    }

    return (
        <div className={cn('space-y-4', className)}>
            {/* Search and Bulk Actions */}
            {(enableSearch || (enableSelection && currentSelectedIds.length > 0)) && (
                <div className="flex items-center justify-between gap-4">
                    {/* Search */}
                    {enableSearch && (
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={searchPlaceholder}
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value)
                                    setCurrentPage(1)
                                }}
                                className="pl-9 pr-9"
                            />
                            {searchTerm && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                                    onClick={() => setSearchTerm('')}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Bulk Actions */}
                    {enableSelection && currentSelectedIds.length > 0 && bulkActions && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                {currentSelectedIds.length} selecionado(s)
                            </span>
                            {bulkActions(currentSelectedIds)}
                        </div>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {enableSelection && (
                                <TableHead className="w-12">
                                    <Checkbox
                                        checked={isAllSelected}
                                        onCheckedChange={handleSelectAll}
                                        aria-label="Selecionar todos"
                                        className={cn(
                                            isSomeSelected && 'data-[state=checked]:bg-primary/50'
                                        )}
                                    />
                                </TableHead>
                            )}
                            {columns.map((column) => (
                                <TableHead key={column.key} className={column.className}>
                                    {column.sortable !== false && enableSorting ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="-ml-3 h-8 data-[state=open]:bg-accent"
                                            onClick={() => handleSort(column.key)}
                                        >
                                            {column.label}
                                            {renderSortIcon(column.key)}
                                        </Button>
                                    ) : (
                                        column.label
                                    )}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedData.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length + (enableSelection ? 1 : 0)}
                                    className="h-24 text-center"
                                >
                                    {emptyState || (
                                        <div className="text-muted-foreground">
                                            {searchTerm
                                                ? 'Nenhum resultado encontrado'
                                                : 'Nenhum dado disponível'}
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedData.map((item) => {
                                const rowId = getRowId(item)
                                const isSelected = currentSelectedIds.includes(rowId)

                                return (
                                    <TableRow
                                        key={rowId}
                                        onClick={() => onRowClick?.(item)}
                                        className={cn(
                                            onRowClick && 'cursor-pointer',
                                            isSelected && 'bg-muted/50'
                                        )}
                                    >
                                        {enableSelection && (
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={(checked) =>
                                                        handleSelectRow(rowId, checked as boolean)
                                                    }
                                                    aria-label={`Selecionar linha ${rowId}`}
                                                />
                                            </TableCell>
                                        )}
                                        {columns.map((column) => (
                                            <TableCell key={column.key} className={column.className}>
                                                {column.render
                                                    ? column.render(item)
                                                    : String(item[column.key] ?? '-')}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {pagination && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Itens por página:</span>
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(value) => {
                                setPageSize(Number(value))
                                setCurrentPage(1) // Resetar para primeira página ao mudar tamanho
                            }}
                        >
                            <SelectTrigger className="w-[100px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground">
                            Mostrando {(currentPage - 1) * pageSize + 1} a{' '}
                            {Math.min(currentPage * pageSize, sortedData.length)} de {sortedData.length}{' '}
                            resultado(s)
                        </span>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="text-sm">
                                Página {currentPage} de {totalPages}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

