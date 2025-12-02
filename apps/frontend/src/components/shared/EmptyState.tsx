'use client'

import { LucideIcon, FileX, Search, Inbox, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
    /** Ícone a ser exibido */
    icon?: LucideIcon
    /** Título do estado vazio */
    title: string
    /** Descrição adicional */
    description?: string
    /** Texto do botão de ação */
    actionLabel?: string
    /** Callback do botão de ação */
    onAction?: () => void
    /** Variante do botão */
    actionVariant?: 'default' | 'outline' | 'secondary'
    /** Classes CSS adicionais */
    className?: string
    /** Tamanho do estado vazio */
    size?: 'sm' | 'md' | 'lg'
}

export function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    actionLabel,
    onAction,
    actionVariant = 'default',
    className,
    size = 'md',
}: EmptyStateProps) {
    const sizeClasses = {
        sm: {
            container: 'py-8',
            icon: 'h-10 w-10',
            title: 'text-base',
            description: 'text-xs',
        },
        md: {
            container: 'py-12',
            icon: 'h-14 w-14',
            title: 'text-lg',
            description: 'text-sm',
        },
        lg: {
            container: 'py-16',
            icon: 'h-20 w-20',
            title: 'text-xl',
            description: 'text-base',
        },
    }

    const sizes = sizeClasses[size]

    return (
        <div className={cn(
            'flex flex-col items-center justify-center text-center',
            sizes.container,
            className
        )}>
            <div className="relative mb-4">
                {/* Background glow */}
                <div className="absolute inset-0 bg-primary/5 rounded-full blur-2xl scale-150" />
                
                {/* Icon container */}
                <div className="relative p-4 rounded-full bg-muted/50 border border-border">
                    <Icon className={cn(sizes.icon, 'text-muted-foreground/50')} />
                </div>
            </div>

            <h3 className={cn('font-semibold text-foreground mb-1', sizes.title)}>
                {title}
            </h3>

            {description && (
                <p className={cn('text-muted-foreground max-w-sm', sizes.description)}>
                    {description}
                </p>
            )}

            {actionLabel && onAction && (
                <Button
                    variant={actionVariant}
                    onClick={onAction}
                    className="mt-4"
                >
                    {actionLabel}
                </Button>
            )}
        </div>
    )
}

// Variantes pré-definidas para casos comuns
export function NoResults({ 
    searchTerm,
    onClear,
    className 
}: { 
    searchTerm?: string
    onClear?: () => void
    className?: string 
}) {
    return (
        <EmptyState
            icon={Search}
            title="Nenhum resultado encontrado"
            description={searchTerm 
                ? `Não encontramos resultados para "${searchTerm}". Tente ajustar sua busca.`
                : 'Tente ajustar os filtros ou termos de busca.'
            }
            actionLabel={onClear ? 'Limpar busca' : undefined}
            onAction={onClear}
            actionVariant="outline"
            className={className}
        />
    )
}

export function NoData({ 
    title = 'Nenhum dado disponível',
    description,
    actionLabel,
    onAction,
    className 
}: { 
    title?: string
    description?: string
    actionLabel?: string
    onAction?: () => void
    className?: string 
}) {
    return (
        <EmptyState
            icon={FileX}
            title={title}
            description={description || 'Não há dados para exibir no momento.'}
            actionLabel={actionLabel}
            onAction={onAction}
            className={className}
        />
    )
}

export function EmptyFolder({ 
    title = 'Pasta vazia',
    description,
    actionLabel,
    onAction,
    className 
}: { 
    title?: string
    description?: string
    actionLabel?: string
    onAction?: () => void
    className?: string 
}) {
    return (
        <EmptyState
            icon={FolderOpen}
            title={title}
            description={description || 'Esta pasta não contém itens.'}
            actionLabel={actionLabel}
            onAction={onAction}
            className={className}
        />
    )
}

