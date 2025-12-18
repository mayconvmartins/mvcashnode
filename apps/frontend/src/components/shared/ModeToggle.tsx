'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { useAuthStore } from '@/lib/stores/authStore'
import { cn } from '@/lib/utils'
import { Play, PlayCircle } from 'lucide-react'

interface ModeToggleProps {
    className?: string
    showLabel?: boolean
}

export function ModeToggle({ className, showLabel = true }: ModeToggleProps) {
    const { tradeMode, toggle, isReal, isSimulation } = useTradeMode()
    const { user } = useAuthStore()
    
    // Ocultar para assinantes (eles só operam em modo REAL)
    const isSubscriber = user?.roles?.some(r => r.role === 'subscriber') 
                         && !user?.roles?.some(r => r.role === 'admin')
    
    if (isSubscriber) {
        return null
    }

    return (
        <div className={cn('flex items-center gap-2', className)}>
            {showLabel && <span className="text-sm font-medium text-muted-foreground">Modo:</span>}
            <Button
                variant="outline"
                size="sm"
                onClick={toggle}
                className="gap-2"
            >
                {isReal ? (
                    <>
                        <Play className="h-4 w-4" />
                        REAL
                    </>
                ) : (
                    <>
                        <PlayCircle className="h-4 w-4" />
                        SIMULATION
                    </>
                )}
            </Button>
            <Badge
                variant={isReal ? 'destructive' : 'secondary'}
                className="animate-pulse-badge"
            >
                {tradeMode}
            </Badge>
        </div>
    )
}

