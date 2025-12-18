'use client'

import { ReactNode, forwardRef, useId } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

interface FormFieldProps {
    label?: string
    description?: string
    error?: string
    success?: string
    required?: boolean
    optional?: boolean
    tooltip?: string
    children: ReactNode
    className?: string
    labelClassName?: string
    horizontal?: boolean
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(({
    label,
    description,
    error,
    success,
    required,
    optional,
    tooltip,
    children,
    className,
    labelClassName,
    horizontal = false,
}, ref) => {
    const id = useId()
    
    return (
        <div 
            ref={ref}
            className={cn(
                'space-y-2',
                horizontal && 'sm:grid sm:grid-cols-3 sm:gap-4 sm:space-y-0 sm:items-start',
                className
            )}
        >
            {label && (
                <div className={cn(
                    'flex items-center gap-2',
                    horizontal && 'sm:pt-2'
                )}>
                    <Label 
                        htmlFor={id} 
                        className={cn(
                            'text-sm font-medium',
                            error && 'text-destructive',
                            labelClassName
                        )}
                    >
                        {label}
                        {required && <span className="text-destructive ml-1">*</span>}
                        {optional && <span className="text-muted-foreground ml-1 text-xs font-normal">(opcional)</span>}
                    </Label>
                    {tooltip && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    {tooltip}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            )}
            
            <div className={cn(horizontal && 'sm:col-span-2')}>
                {description && !error && !success && (
                    <p className="text-xs text-muted-foreground mb-2">
                        {description}
                    </p>
                )}
                
                {children}
                
                {error && (
                    <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {error}
                    </p>
                )}
                
                {success && !error && (
                    <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {success}
                    </p>
                )}
            </div>
        </div>
    )
})

FormField.displayName = 'FormField'

// Form Section for grouping fields
interface FormSectionProps {
    title?: string
    description?: string
    children: ReactNode
    className?: string
    collapsible?: boolean
    defaultOpen?: boolean
}

export function FormSection({ 
    title, 
    description, 
    children, 
    className,
}: FormSectionProps) {
    return (
        <div className={cn('space-y-4', className)}>
            {(title || description) && (
                <div className="space-y-1">
                    {title && (
                        <h3 className="text-lg font-semibold">{title}</h3>
                    )}
                    {description && (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    )}
                </div>
            )}
            <div className="space-y-4">
                {children}
            </div>
        </div>
    )
}

// Form Actions wrapper
interface FormActionsProps {
    children: ReactNode
    className?: string
    align?: 'left' | 'center' | 'right' | 'between'
}

export function FormActions({ children, className, align = 'right' }: FormActionsProps) {
    const alignClasses = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end',
        between: 'justify-between',
    }

    return (
        <div className={cn(
            'flex items-center gap-3 pt-4 border-t',
            alignClasses[align],
            className
        )}>
            {children}
        </div>
    )
}

// Loading overlay for forms
interface FormLoadingOverlayProps {
    loading: boolean
    text?: string
}

export function FormLoadingOverlay({ loading, text = 'Salvando...' }: FormLoadingOverlayProps) {
    if (!loading) return null

    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
            <div className="flex items-center gap-3">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">{text}</span>
            </div>
        </div>
    )
}

