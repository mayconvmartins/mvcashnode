import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/lib/stores/authStore'

interface UseWebSocketOptions {
    url?: string
    enabled?: boolean
    onMessage?: (data: any) => void
    onError?: (error: Event) => void
    onOpen?: () => void
    onClose?: () => void
    reconnectInterval?: number
    maxReconnectAttempts?: number
}

export function useWebSocket({
    url,
    enabled = true,
    onMessage,
    onError,
    onOpen,
    onClose,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
}: UseWebSocketOptions) {
    const [isConnected, setIsConnected] = useState(false)
    const [reconnectAttempts, setReconnectAttempts] = useState(0)
    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const { accessToken } = useAuthStore()

    useEffect(() => {
        if (!enabled || !url) return

        const connect = () => {
            try {
                // Normalizar a URL para garantir que tenha um path válido
                let normalizedUrl = url.trim()
                
                // Se a URL não começar com ws:// ou wss://, adicionar ws:// como padrão
                if (!normalizedUrl.startsWith('ws://') && !normalizedUrl.startsWith('wss://')) {
                    normalizedUrl = `ws://${normalizedUrl}`
                }
                
                // Criar objeto URL - garantir que tenha path válido
                let wsUrl: URL
                try {
                    wsUrl = new URL(normalizedUrl)
                } catch (urlError) {
                    // Se falhar, tentar adicionar path explícito
                    if (!normalizedUrl.includes('/') || normalizedUrl.endsWith('/')) {
                        normalizedUrl = normalizedUrl.replace(/\/$/, '') + '/'
                    }
                    wsUrl = new URL(normalizedUrl)
                }
                
                // Garantir que tenha um path válido (pelo menos /)
                if (!wsUrl.pathname || wsUrl.pathname === '') {
                    wsUrl.pathname = '/'
                }
                
                // Se a página estiver em HTTPS, garantir que o WebSocket use wss://
                if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
                    if (wsUrl.protocol === 'ws:') {
                        wsUrl.protocol = 'wss:'
                    }
                }
                
                if (accessToken) {
                    wsUrl.searchParams.set('token', accessToken)
                }

                const finalUrl = wsUrl.toString()
                
                // Validar URL final antes de criar WebSocket
                if (!finalUrl.startsWith('ws://') && !finalUrl.startsWith('wss://')) {
                    throw new Error(`Invalid WebSocket URL: ${finalUrl}`)
                }

                const ws = new WebSocket(finalUrl)

                ws.onopen = () => {
                    setIsConnected(true)
                    setReconnectAttempts(0)
                    onOpen?.()
                }

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data)
                        onMessage?.(data)
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error)
                    }
                }

                ws.onerror = (error) => {
                    onError?.(error)
                }

                ws.onclose = () => {
                    setIsConnected(false)
                    onClose?.()

                    // Tentar reconectar
                    if (reconnectAttempts < maxReconnectAttempts) {
                        reconnectTimeoutRef.current = setTimeout(() => {
                            setReconnectAttempts((prev) => prev + 1)
                            connect()
                        }, reconnectInterval)
                    }
                }

                wsRef.current = ws
            } catch (error) {
                console.error('WebSocket connection error:', error)
            }
        }

        connect()

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [enabled, url, accessToken, reconnectAttempts, maxReconnectAttempts, reconnectInterval, onMessage, onError, onOpen, onClose])

    const send = (data: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data))
        }
    }

    return {
        isConnected,
        send,
    }
}

