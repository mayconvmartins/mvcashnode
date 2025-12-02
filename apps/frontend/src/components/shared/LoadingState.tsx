'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
    /** Texto a ser exibido durante o loading */
    text?: string
    /** Tamanho do spinner */
    size?: 'sm' | 'md' | 'lg'
    /** Se deve ocupar a tela inteira */
    fullScreen?: boolean
    /** Classes CSS adicionais */
    className?: string
}

export function LoadingState({ 
    text = 'Carregando...', 
    size = 'md',
    fullScreen = false,
    className 
}: LoadingStateProps) {
    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-8 w-8',
        lg: 'h-12 w-12',
    }

    const containerClasses = fullScreen 
        ? 'fixed inset-0 bg-background/80 backdrop-blur-sm z-50' 
        : 'py-12'

    return (
        <div className={cn(
            'flex flex-col items-center justify-center',
            containerClasses,
            className
        )}>
            <div className="relative">
                {/* Outer glow */}
                <div className={cn(
                    'absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse',
                    size === 'lg' ? 'scale-150' : 'scale-125'
                )} />
                
                {/* Spinner */}
                <Loader2 className={cn(
                    'animate-spin text-primary relative',
                    sizeClasses[size]
                )} />
            </div>
            
            {text && (
                <p className={cn(
                    'mt-4 text-muted-foreground animate-pulse',
                    size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
                )}>
                    {text}
                </p>
            )}
        </div>
    )
}

interface LoadingOverlayProps {
    /** Se está visível */
    visible: boolean
    /** Texto a ser exibido */
    text?: string
}

export function LoadingOverlay({ visible, text }: LoadingOverlayProps) {
    if (!visible) return null

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-card p-6 rounded-lg shadow-lg border flex flex-col items-center gap-4 animate-scale-in">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {text && <p className="text-sm text-muted-foreground">{text}</p>}
            </div>
        </div>
    )
}

interface LoadingDotsProps {
    /** Classes CSS adicionais */
    className?: string
}

export function LoadingDots({ className }: LoadingDotsProps) {
    return (
        <span className={cn('inline-flex items-center gap-1', className)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
    )
}

interface SkeletonCardProps {
    /** Número de linhas de skeleton */
    lines?: number
    /** Se deve mostrar um avatar/ícone */
    showAvatar?: boolean
    /** Classes CSS adicionais */
    className?: string
}

export function SkeletonCard({ lines = 3, showAvatar = false, className }: SkeletonCardProps) {
    return (
        <div className={cn('p-4 border rounded-lg space-y-3', className)}>
            <div className="flex items-center gap-3">
                {showAvatar && (
                    <div className="h-10 w-10 rounded-full bg-muted shimmer" />
                )}
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-muted shimmer" />
                    <div className="h-3 w-1/2 rounded bg-muted shimmer" />
                </div>
            </div>
            {Array.from({ length: lines }).map((_, i) => (
                <div 
                    key={i} 
                    className="h-3 rounded bg-muted shimmer" 
                    style={{ width: `${100 - i * 15}%` }}
                />
            ))}
        </div>
    )
}

interface SkeletonTableProps {
    /** Número de linhas */
    rows?: number
    /** Número de colunas */
    columns?: number
    /** Classes CSS adicionais */
    className?: string
}

export function SkeletonTable({ rows = 5, columns = 4, className }: SkeletonTableProps) {
    return (
        <div className={cn('space-y-2', className)}>
            {/* Header */}
            <div className="flex gap-4 p-3 border-b">
                {Array.from({ length: columns }).map((_, i) => (
                    <div key={i} className="flex-1 h-4 rounded bg-muted shimmer" />
                ))}
            </div>
            
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-4 p-3 border-b last:border-0">
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <div 
                            key={colIndex} 
                            className="flex-1 h-4 rounded bg-muted shimmer"
                            style={{ animationDelay: `${(rowIndex * columns + colIndex) * 50}ms` }}
                        />
                    ))}
                </div>
            ))}
        </div>
    )
}

