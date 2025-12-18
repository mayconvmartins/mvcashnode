'use client'

import { useState, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
} from '@/components/ui/sheet'
import { Filter, X, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterChip {
    id: string
    label: string
    value: string
}

interface ResponsiveFiltersProps {
    children: ReactNode
    activeFilters?: FilterChip[]
    onClearFilter?: (id: string) => void
    onClearAll?: () => void
    className?: string
    title?: string
    description?: string
}

export function ResponsiveFilters({
    children,
    activeFilters = [],
    onClearFilter,
    onClearAll,
    className,
    title = 'Filtros',
    description = 'Ajuste os filtros para refinar seus resultados',
}: ResponsiveFiltersProps) {
    const [isOpen, setIsOpen] = useState(false)
    const hasActiveFilters = activeFilters.length > 0

    return (
        <div className={cn('space-y-3', className)}>
            {/* Desktop: Inline filters */}
            <div className="hidden md:flex items-center gap-3 flex-wrap">
                {children}
                
                {/* Active filter chips */}
                {hasActiveFilters && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {activeFilters.map((filter) => (
                            <Badge 
                                key={filter.id} 
                                variant="secondary"
                                className="pl-2 pr-1 py-1 flex items-center gap-1"
                            >
                                <span className="text-xs text-muted-foreground">{filter.label}:</span>
                                <span className="text-xs font-medium">{filter.value}</span>
                                {onClearFilter && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                                        onClick={() => onClearFilter(filter.id)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </Badge>
                        ))}
                        {onClearAll && activeFilters.length > 1 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                onClick={onClearAll}
                            >
                                Limpar todos
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Mobile: Button + Sheet */}
            <div className="md:hidden">
                <div className="flex items-center gap-2">
                    <Sheet open={isOpen} onOpenChange={setIsOpen}>
                        <SheetTrigger asChild>
                            <Button 
                                variant="outline" 
                                className="flex-1 justify-start gap-2"
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                                <span>Filtros</span>
                                {hasActiveFilters && (
                                    <Badge variant="secondary" className="ml-auto">
                                        {activeFilters.length}
                                    </Badge>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
                            <SheetHeader className="text-left pb-4">
                                <SheetTitle className="flex items-center gap-2">
                                    <Filter className="h-5 w-5" />
                                    {title}
                                </SheetTitle>
                                <SheetDescription>
                                    {description}
                                </SheetDescription>
                            </SheetHeader>
                            
                            <div className="space-y-4 py-4 overflow-y-auto max-h-[calc(85vh-180px)]">
                                {children}
                            </div>

                            <SheetFooter className="flex-row gap-2 pt-4 border-t">
                                {onClearAll && hasActiveFilters && (
                                    <Button 
                                        variant="outline" 
                                        className="flex-1"
                                        onClick={() => {
                                            onClearAll()
                                            setIsOpen(false)
                                        }}
                                    >
                                        Limpar Filtros
                                    </Button>
                                )}
                                <Button 
                                    className="flex-1"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Aplicar
                                </Button>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>

                {/* Active filter chips for mobile */}
                {hasActiveFilters && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 mt-2 scrollbar-hide">
                        {activeFilters.map((filter) => (
                            <Badge 
                                key={filter.id} 
                                variant="secondary"
                                className="pl-2 pr-1 py-1 flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                            >
                                <span className="text-xs">{filter.value}</span>
                                {onClearFilter && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                                        onClick={() => onClearFilter(filter.id)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// Filter field wrapper for consistent styling
interface FilterFieldProps {
    label: string
    children: ReactNode
    className?: string
}

export function FilterField({ label, children, className }: FilterFieldProps) {
    return (
        <div className={cn('space-y-2', className)}>
            <label className="text-sm font-medium text-muted-foreground">
                {label}
            </label>
            {children}
        </div>
    )
}

