'use client'

import { Wifi, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useWebSocketContext } from './WebSocketProvider'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

export function WebSocketStatus() {
    const { isConnected, reconnectAttempts } = useWebSocketContext()

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                        {isConnected ? (
                            <>
                                <div className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </div>
                                <Wifi className="h-4 w-4 text-green-500" />
                            </>
                        ) : (
                            <>
                                <div className="h-2 w-2 rounded-full bg-red-500"></div>
                                <WifiOff className="h-4 w-4 text-red-500" />
                            </>
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    {isConnected ? (
                        <p>WebSocket Conectado</p>
                    ) : reconnectAttempts > 0 ? (
                        <p>Reconectando... (tentativa {reconnectAttempts})</p>
                    ) : (
                        <p>WebSocket Desconectado</p>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

