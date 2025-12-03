'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useWebSocketWithQueryInvalidation, type WebSocketEvent } from '@/lib/hooks/useWebSocketWithQueryInvalidation'

interface WebSocketContextType {
    isConnected: boolean
    reconnectAttempts: number
    lastMessage: any
    send: (data: any) => boolean
    subscribe: (events: WebSocketEvent[]) => boolean
    unsubscribe: (events: WebSocketEvent[]) => boolean
    connect: () => void
    disconnect: () => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const ws = useWebSocketWithQueryInvalidation({
        enabled: true,
        autoConnect: true,
    })

    return <WebSocketContext.Provider value={ws}>{children}</WebSocketContext.Provider>
}

export function useWebSocketContext() {
    const context = useContext(WebSocketContext)
    if (!context) {
        throw new Error('useWebSocketContext must be used within WebSocketProvider')
    }
    return context
}

