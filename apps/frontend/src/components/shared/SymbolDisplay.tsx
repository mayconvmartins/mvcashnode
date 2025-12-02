'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Exchange } from '@/lib/types'
import { Coins } from 'lucide-react'

interface SymbolDisplayProps {
    exchange: Exchange
    symbol: string
    className?: string
    showExchange?: boolean
}

const exchangeLabels: Record<Exchange, string> = {
    BINANCE_SPOT: 'Binance Spot',
    BINANCE_FUTURES: 'Binance Futures',
    BYBIT_SPOT: 'Bybit Spot',
    BYBIT_FUTURES: 'Bybit Futures',
}

const exchangeColors: Record<Exchange, string> = {
    BINANCE_SPOT: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
    BINANCE_FUTURES: 'bg-yellow-600/20 text-yellow-600 border-yellow-600/30',
    BYBIT_SPOT: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
    BYBIT_FUTURES: 'bg-blue-600/20 text-blue-600 border-blue-600/30',
}

export function SymbolDisplay({ exchange, symbol, className, showExchange = true }: SymbolDisplayProps) {
    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono font-semibold">{symbol}</span>
            </div>
            {showExchange && (
                <Badge
                    variant="outline"
                    className={cn('text-xs', exchangeColors[exchange])}
                >
                    {exchangeLabels[exchange]}
                </Badge>
            )}
        </div>
    )
}

