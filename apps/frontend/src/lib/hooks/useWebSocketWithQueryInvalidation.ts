import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/authStore'
import { useNotificationsStore } from '@/lib/stores/notificationsStore'
import { toast } from 'sonner'

export type WebSocketEvent =
    | 'position.updated'
    | 'position.closed'
    | 'order.filled'
    | 'order.cancelled'
    | 'webhook.received'
    | 'job.completed'
    | 'job.failed'
    | 'vault.updated'
    | 'account.updated'

interface WebSocketMessage {
    event: WebSocketEvent
    data: any
    timestamp: string
}

interface UseWebSocketOptions {
    url?: string
    enabled?: boolean
    autoConnect?: boolean
    reconnectInterval?: number
    maxReconnectAttempts?: number
    heartbeatInterval?: number
}

export function useWebSocketWithQueryInvalidation({
    url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4010',
    enabled = true,
    autoConnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    heartbeatInterval = 30000,
}: UseWebSocketOptions = {}) {
    const queryClient = useQueryClient()
    const { accessToken } = useAuthStore()
    const { addNotification } = useNotificationsStore()

    const [isConnected, setIsConnected] = useState(false)
    const [reconnectAttempts, setReconnectAttempts] = useState(0)
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)

    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const missedHeartbeatsRef = useRef(0)

    // Event handlers para invalidação de queries
    const handleMessage = useCallback(
        (message: WebSocketMessage) => {
            console.log('📡 WebSocket event received:', message.event, message.data)
            setLastMessage(message)

            const { event, data } = message

            // Invalidar queries baseado no evento
            switch (event) {
                case 'position.updated':
                case 'position.closed':
                    queryClient.invalidateQueries({ queryKey: ['positions'] })
                    queryClient.invalidateQueries({ queryKey: ['position', data.id] })
                    queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
                    
                    if (event === 'position.closed') {
                        addNotification({
                            type: 'success',
                            title: 'Posição Fechada',
                            message: `${data.symbol} - PnL: ${data.pnl > 0 ? '+' : ''}${data.pnl.toFixed(2)} USDT`,
                        })
                    }
                    break

                case 'order.filled':
                    queryClient.invalidateQueries({ queryKey: ['positions'] })
                    queryClient.invalidateQueries({ queryKey: ['limit-orders'] })
                    addNotification({
                        type: 'info',
                        title: 'Ordem Executada',
                        message: `${data.symbol} - ${data.side} ${data.qty} @ ${data.price}`,
                    })
                    break

                case 'order.cancelled':
                    queryClient.invalidateQueries({ queryKey: ['limit-orders'] })
                    queryClient.invalidateQueries({ queryKey: ['limit-order', data.id] })
                    break

                case 'webhook.received':
                    queryClient.invalidateQueries({ queryKey: ['webhook-events'] })
                    queryClient.invalidateQueries({ queryKey: ['webhooks'] })
                    addNotification({
                        type: 'info',
                        title: 'Webhook Recebido',
                        message: `${data.action} - ${data.symbol}`,
                    })
                    break

                case 'job.completed':
                    queryClient.invalidateQueries({ queryKey: ['operations'] })
                    queryClient.invalidateQueries({ queryKey: ['operation', data.id] })
                    break

                case 'job.failed':
                    queryClient.invalidateQueries({ queryKey: ['operations'] })
                    addNotification({
                        type: 'error',
                        title: 'Job Falhou',
                        message: data.error || 'Erro ao executar job',
                    })
                    break

                case 'vault.updated':
                    queryClient.invalidateQueries({ queryKey: ['vaults'] })
                    queryClient.invalidateQueries({ queryKey: ['vault', data.id] })
                    queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
                    break

                case 'account.updated':
                    queryClient.invalidateQueries({ queryKey: ['accounts'] })
                    queryClient.invalidateQueries({ queryKey: ['account', data.id] })
                    break

                default:
                    console.warn('Unhandled WebSocket event:', event)
            }
        },
        [queryClient, addNotification]
    )

    // Heartbeat para manter a conexão viva
    const startHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current)
        }

        heartbeatIntervalRef.current = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'ping' }))
                missedHeartbeatsRef.current++

                if (missedHeartbeatsRef.current >= 3) {
                    console.warn('❌ WebSocket: Too many missed heartbeats, closing connection')
                    wsRef.current.close()
                }
            }
        }, heartbeatInterval)
    }, [heartbeatInterval])

    const stopHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current)
            heartbeatIntervalRef.current = null
        }
        missedHeartbeatsRef.current = 0
    }, [])

    // Conectar ao WebSocket
    const connect = useCallback(() => {
        if (!enabled || !url) return

        try {
            let wsUrl = new URL(url)
            
            // Se a página estiver em HTTPS, garantir que o WebSocket use wss://
            if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
                if (wsUrl.protocol === 'ws:') {
                    wsUrl.protocol = 'wss:'
                }
            }
            
            if (accessToken) {
                wsUrl.searchParams.set('token', accessToken)
            }

            console.log('🔌 Connecting to WebSocket:', wsUrl.origin)

            const ws = new WebSocket(wsUrl.toString())

            ws.onopen = () => {
                console.log('✅ WebSocket connected')
                setIsConnected(true)
                setReconnectAttempts(0)
                startHeartbeat()
                toast.success('WebSocket conectado', { duration: 2000 })
            }

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data)

                    // Reset heartbeat counter on any message
                    if (message.type === 'pong') {
                        missedHeartbeatsRef.current = 0
                        return
                    }

                    // Process event messages
                    if (message.event && message.data) {
                        handleMessage(message as WebSocketMessage)
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error)
                }
            }

            ws.onerror = (error) => {
                // Suprimir erro se for conexão recusada (servidor WebSocket não implementado ainda)
                console.warn('WebSocket error (servidor pode não estar disponível):', error.type)
            }

            ws.onclose = (event) => {
                console.log('🔌 WebSocket closed:', event.code, event.reason)
                setIsConnected(false)
                stopHeartbeat()

                // Auto-reconnect
                if (enabled && reconnectAttempts < maxReconnectAttempts) {
                    const delay = Math.min(reconnectInterval * (reconnectAttempts + 1), 30000)
                    console.log(`🔄 Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`)
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        setReconnectAttempts((prev) => prev + 1)
                        connect()
                    }, delay)
                } else if (reconnectAttempts >= maxReconnectAttempts) {
                    console.warn('Max WebSocket reconnection attempts reached (servidor WebSocket não disponível)')
                    // Não mostrar toast pois o WebSocket ainda não está implementado
                }
            }

            wsRef.current = ws
        } catch (error) {
            console.error('Error creating WebSocket connection:', error)
        }
    }, [enabled, url, accessToken, reconnectAttempts, maxReconnectAttempts, reconnectInterval, handleMessage, startHeartbeat, stopHeartbeat])

    // Disconnect
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
        }
        stopHeartbeat()
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
        setIsConnected(false)
        setReconnectAttempts(0)
    }, [stopHeartbeat])

    // Send message
    const send = useCallback((data: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data))
            return true
        }
        console.warn('WebSocket is not connected')
        return false
    }, [])

    // Subscribe to specific events
    const subscribe = useCallback(
        (events: WebSocketEvent[]) => {
            return send({ type: 'subscribe', events })
        },
        [send]
    )

    // Unsubscribe from events
    const unsubscribe = useCallback(
        (events: WebSocketEvent[]) => {
            return send({ type: 'unsubscribe', events })
        },
        [send]
    )

    // Auto-connect on mount
    useEffect(() => {
        if (autoConnect && enabled) {
            connect()
        }

        return () => {
            disconnect()
        }
    }, []) // Only run on mount/unmount

    // Reconnect when enabled changes or token changes
    useEffect(() => {
        if (enabled && !isConnected && wsRef.current === null) {
            connect()
        } else if (!enabled && isConnected) {
            disconnect()
        }
    }, [enabled, accessToken])

    return {
        isConnected,
        reconnectAttempts,
        lastMessage,
        send,
        subscribe,
        unsubscribe,
        connect,
        disconnect,
    }
}

