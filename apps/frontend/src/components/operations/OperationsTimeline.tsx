'use client'

import { CheckCircle, XCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/format'

export interface TimelineStep {
    id: string
    title: string
    description?: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
    timestamp?: Date | string
    error?: string
}

interface OperationsTimelineProps {
    steps: TimelineStep[]
    currentStep?: number
}

export function OperationsTimeline({ steps, currentStep }: OperationsTimelineProps) {
    const getStatusIcon = (status: TimelineStep['status'], isCurrentStep: boolean) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-5 w-5 text-green-500" />
            case 'failed':
                return <XCircle className="h-5 w-5 text-destructive" />
            case 'in_progress':
                return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            case 'skipped':
                return <AlertTriangle className="h-5 w-5 text-yellow-500" />
            default:
                return (
                    <Clock
                        className={cn(
                            'h-5 w-5',
                            isCurrentStep ? 'text-primary' : 'text-muted-foreground'
                        )}
                    />
                )
        }
    }

    const getStatusColor = (status: TimelineStep['status']) => {
        switch (status) {
            case 'completed':
                return 'border-green-500'
            case 'failed':
                return 'border-destructive'
            case 'in_progress':
                return 'border-blue-500'
            case 'skipped':
                return 'border-yellow-500'
            default:
                return 'border-muted-foreground/30'
        }
    }

    return (
        <div className="space-y-4">
            {steps.map((step, index) => {
                const isCurrentStep = currentStep === index
                const isLast = index === steps.length - 1

                return (
                    <div key={step.id} className="relative">
                        {/* Timeline Line */}
                        {!isLast && (
                            <div
                                className={cn(
                                    'absolute left-[19px] top-[30px] w-0.5 h-full',
                                    step.status === 'completed'
                                        ? 'bg-green-500'
                                        : 'bg-border'
                                )}
                            />
                        )}

                        {/* Step Content */}
                        <div className="flex gap-4">
                            {/* Icon */}
                            <div
                                className={cn(
                                    'flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center bg-background',
                                    getStatusColor(step.status),
                                    isCurrentStep && 'ring-2 ring-primary/20'
                                )}
                            >
                                {getStatusIcon(step.status, isCurrentStep)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 pb-8">
                                <div className="flex items-start justify-between gap-4 mb-1">
                                    <h4
                                        className={cn(
                                            'font-medium',
                                            isCurrentStep && 'text-primary',
                                            step.status === 'failed' && 'text-destructive'
                                        )}
                                    >
                                        {step.title}
                                    </h4>
                                    {step.timestamp && (
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {typeof step.timestamp === 'string'
                                                ? formatDateTime(step.timestamp)
                                                : formatDateTime(step.timestamp.toISOString())}
                                        </span>
                                    )}
                                </div>

                                {step.description && (
                                    <p className="text-sm text-muted-foreground mb-2">
                                        {step.description}
                                    </p>
                                )}

                                {step.error && step.status === 'failed' && (
                                    <div className="mt-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                        <p className="text-sm text-destructive font-medium mb-1">
                                            Erro:
                                        </p>
                                        <p className="text-sm text-destructive/90">{step.error}</p>
                                    </div>
                                )}

                                {step.status === 'in_progress' && (
                                    <div className="mt-2 flex items-center gap-2 text-sm text-blue-500">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>Processando...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
