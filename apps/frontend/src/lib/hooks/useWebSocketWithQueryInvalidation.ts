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
    const isMountedRef = useRef(true)
    const reconnectAttemptsRef = useRef(0)

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
        if (!enabled || !url) {
            console.log('🔌 WebSocket connection skipped:', { enabled, url })
            return
        }

        // Não conectar se não houver token - aguardar token estar disponível
        if (!accessToken) {
            console.log('🔌 WebSocket connection skipped: no access token available')
            return
        }

        // Não conectar se já existe uma conexão ativa
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('🔌 WebSocket already connected, skipping')
            return
        }

        // Não conectar se já está conectando
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
            console.log('🔌 WebSocket already connecting, skipping')
            return
        }

        // Fechar conexão anterior se existir
        if (wsRef.current) {
            console.log('🔌 Closing existing WebSocket connection before reconnecting')
            wsRef.current.close()
            wsRef.current = null
        }

        try {
            // Validar e normalizar URL
            let baseUrl = url.trim()
            
            if (!baseUrl) {
                throw new Error('URL do WebSocket não fornecida')
            }

            console.log('🔌 [WebSocket] URL original:', baseUrl)
            console.log('🔌 [WebSocket] Access token disponível:', !!accessToken, accessToken ? `(${accessToken.substring(0, 20)}...)` : '')
            
            // Se a URL não começar com ws:// ou wss://, adicionar ws:// como padrão
            if (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://')) {
                baseUrl = `ws://${baseUrl}`
                console.log('🔌 [WebSocket] URL normalizada (adicionado ws://):', baseUrl)
            }
            
            // Criar objeto URL com validação
            let wsUrl: URL
            try {
                wsUrl = new URL(baseUrl)
            } catch (urlError) {
                console.error('❌ [WebSocket] Erro ao criar objeto URL:', urlError, 'URL:', baseUrl)
                throw new Error(`URL inválida: ${baseUrl}. Erro: ${urlError instanceof Error ? urlError.message : String(urlError)}`)
            }
            
            // Garantir que o path seja sempre /ws (conforme gateway configurado)
            if (!wsUrl.pathname || wsUrl.pathname === '' || wsUrl.pathname === '/') {
                wsUrl.pathname = '/ws'
            }
            
            // Se a página estiver em HTTPS, garantir que o WebSocket use wss://
            if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
                if (wsUrl.protocol === 'ws:') {
                    wsUrl.protocol = 'wss:'
                    console.log('🔌 [WebSocket] Protocolo alterado para wss:// (página em HTTPS)')
                }
            }
            
            // Validar que temos um hostname
            if (!wsUrl.hostname) {
                throw new Error(`URL inválida: hostname não encontrado em ${baseUrl}`)
            }
            
            // Não adicionar porta automaticamente - deixar o navegador usar a porta padrão
            // Em produção com proxy reverso, a URL não deve ter porta (usa 443 para wss://)
            // Em desenvolvimento, a porta deve estar na URL original
            if (wsUrl.port) {
                console.log('🔌 [WebSocket] Porta especificada na URL:', wsUrl.port)
            } else {
                console.log('🔌 [WebSocket] Sem porta na URL - usando porta padrão do protocolo')
            }
            
            // Adicionar token na query string
            if (!accessToken) {
                throw new Error('Token de acesso não disponível para conexão WebSocket')
            }
            
            wsUrl.searchParams.set('token', accessToken)

            const finalUrl = wsUrl.toString()
            
            // Validações finais da URL
            if (!finalUrl.startsWith('ws://') && !finalUrl.startsWith('wss://')) {
                throw new Error(`URL final inválida (deve começar com ws:// ou wss://): ${finalUrl}`)
            }
            
            if (!finalUrl.includes('token=')) {
                throw new Error(`Token não encontrado na URL final: ${finalUrl.replace(/token=[^&]+/, 'token=***')}`)
            }

            console.log('🔌 [WebSocket] Conectando:', {
                hostname: wsUrl.hostname,
                port: wsUrl.port,
                pathname: wsUrl.pathname,
                protocol: wsUrl.protocol,
                hasToken: true,
                url: finalUrl.replace(/token=[^&]+/, 'token=***'),
            })

            const ws = new WebSocket(finalUrl)
            
            // Timeout de conexão (10 segundos)
            const connectionTimeout = setTimeout(() => {
                if (ws.readyState === WebSocket.CONNECTING) {
                    console.warn('⚠️ WebSocket connection timeout')
                    ws.close(1006, 'Connection timeout')
                }
            }, 10000)

            ws.onopen = () => {
                clearTimeout(connectionTimeout)
                console.log('✅ WebSocket connection opened')
                setIsConnected(true)
                reconnectAttemptsRef.current = 0
                setReconnectAttempts(0)
                startHeartbeat()
                toast.success('WebSocket conectado', { duration: 2000 })
            }

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data)

                    // Tratar mensagem de conexão bem-sucedida
                    if (message.type === 'connected') {
                        console.log('✅ WebSocket connection confirmed:', message.message)
                        missedHeartbeatsRef.current = 0
                        return
                    }

                    // Reset heartbeat counter on any message
                    if (message.type === 'pong') {
                        missedHeartbeatsRef.current = 0
                        return
                    }

                    // Process event messages
                    if (message.event && message.data) {
                        handleMessage(message as WebSocketMessage)
                    } else {
                        console.debug('📨 WebSocket message received:', message)
                    }
                } catch (error) {
                    console.error('❌ Error parsing WebSocket message:', error, 'Raw data:', event.data)
                }
            }

            ws.onerror = (error) => {
                clearTimeout(connectionTimeout)
                console.error('❌ WebSocket error:', {
                    type: error.type,
                    target: error.target,
                    readyState: wsRef.current?.readyState,
                })
                // Não fechar a conexão aqui, deixar o onclose lidar com isso
            }

            ws.onclose = (event) => {
                clearTimeout(connectionTimeout)
                const closeCode = event.code
                const closeReason = event.reason || 'No reason provided'
                const wasClean = event.wasClean
                
                console.log('🔌 WebSocket closed:', {
                    code: closeCode,
                    reason: closeReason,
                    wasClean,
                })
                
                setIsConnected(false)
                stopHeartbeat()

                // Não reconectar se o componente foi desmontado
                if (!isMountedRef.current) {
                    console.log('🔌 Component unmounted, skipping reconnection')
                    return
                }

                // Não reconectar se foi fechado por erro de autenticação ou configuração
                if (closeCode === 1008 || closeCode === 1011) {
                    console.warn(`⚠️ WebSocket fechado por erro (código ${closeCode}): ${closeReason}`)
                    toast.error(`Erro de conexão: ${closeReason}`, {
                        duration: 5000,
                    })
                    return
                }

                // Auto-reconnect apenas se habilitado e não excedeu tentativas
                const currentAttempts = reconnectAttemptsRef.current
                if (enabled && currentAttempts < maxReconnectAttempts) {
                    const delay = Math.min(reconnectInterval * (currentAttempts + 1), 30000)
                    console.log(`🔄 Reconnecting in ${delay}ms... (attempt ${currentAttempts + 1}/${maxReconnectAttempts})`)
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        // Verificar novamente se ainda está montado antes de reconectar
                        if (isMountedRef.current && enabled) {
                            reconnectAttemptsRef.current++
                            setReconnectAttempts(reconnectAttemptsRef.current)
                            connect()
                        }
                    }, delay)
                } else if (currentAttempts >= maxReconnectAttempts) {
                    console.warn(`⚠️ Max WebSocket reconnection attempts reached (${maxReconnectAttempts})`)
                    toast.error('Falha ao conectar WebSocket após múltiplas tentativas', {
                        duration: 5000,
                    })
                }
            }

            wsRef.current = ws
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('❌ Error creating WebSocket connection:', errorMessage)
            setIsConnected(false)
            
            // Mostrar mensagem de erro mais clara para o usuário
            if (errorMessage.includes('Invalid WebSocket URL')) {
                toast.error('URL do WebSocket inválida. Verifique a configuração.', {
                    duration: 5000,
                })
            } else {
                toast.error(`Erro ao conectar WebSocket: ${errorMessage}`, {
                    duration: 5000,
                })
            }
            
            // Tentar reconectar após um delay apenas se não for erro de URL
            if (isMountedRef.current && enabled && !errorMessage.includes('Invalid WebSocket URL')) {
                const delay = reconnectInterval
                reconnectTimeoutRef.current = setTimeout(() => {
                    if (isMountedRef.current) {
                        reconnectAttemptsRef.current++
                        setReconnectAttempts(reconnectAttemptsRef.current)
                        connect()
                    }
                }, delay)
            }
        }
    }, [enabled, url, accessToken, maxReconnectAttempts, reconnectInterval, handleMessage, startHeartbeat, stopHeartbeat])

    // Disconnect
    const disconnect = useCallback(() => {
        console.log('🔌 Disconnecting WebSocket...')
        isMountedRef.current = false
        
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
        }
        stopHeartbeat()
        if (wsRef.current) {
            // Remover listeners para evitar chamadas após desconexão
            wsRef.current.onclose = null
            wsRef.current.onerror = null
            wsRef.current.onmessage = null
            wsRef.current.onopen = null
            
            if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
                wsRef.current.close(1000, 'Client disconnecting')
            }
            wsRef.current = null
        }
        setIsConnected(false)
        reconnectAttemptsRef.current = 0
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

    // Auto-connect on mount e quando enabled mudar
    useEffect(() => {
        isMountedRef.current = true
        
        if (autoConnect && enabled) {
            // Aguardar token estar disponível antes de conectar
            const timeoutId = setTimeout(() => {
                if (isMountedRef.current && accessToken) {
                    connect()
                } else if (isMountedRef.current && !accessToken) {
                    console.log('🔌 WebSocket: Waiting for access token before connecting...')
                }
            }, 100)
            
            return () => {
                clearTimeout(timeoutId)
                disconnect()
            }
        }

        return () => {
            disconnect()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoConnect, enabled]) // connect e disconnect são estáveis via useCallback

    // Reconnect when token changes (mas não quando enabled muda, pois já é tratado acima)
    const previousTokenRef = useRef<string | null>(null)
    useEffect(() => {
        if (!isMountedRef.current) return
        
        // Verificar se o token realmente mudou (evitar reconexões desnecessárias)
        const tokenChanged = previousTokenRef.current !== accessToken
        previousTokenRef.current = accessToken
        
        // Se o token mudou e já estávamos conectados, reconectar
        if (enabled && accessToken && wsRef.current && tokenChanged) {
            const currentState = wsRef.current.readyState
            // Apenas reconectar se realmente estiver conectado (não apenas conectando)
            if (currentState === WebSocket.OPEN) {
                console.log('🔌 Token changed, reconnecting WebSocket...')
                disconnect()
                // Reconectar após um pequeno delay
                const timeoutId = setTimeout(() => {
                    if (isMountedRef.current && enabled && accessToken) {
                        reconnectAttemptsRef.current = 0
                        setReconnectAttempts(0)
                        connect()
                    }
                }, 500)
                
                return () => {
                    clearTimeout(timeoutId)
                }
            }
        } else if (enabled && accessToken && !wsRef.current && tokenChanged) {
            // Se não há conexão mas temos token, tentar conectar (primeira vez ou após desconexão)
            // Mas apenas se o token realmente mudou ou é a primeira vez
            const timeoutId = setTimeout(() => {
                if (isMountedRef.current && enabled && accessToken && !wsRef.current) {
                    console.log('🔌 Token available, connecting WebSocket...')
                    reconnectAttemptsRef.current = 0
                    setReconnectAttempts(0)
                    connect()
                }
            }, 100)
            
            return () => {
                clearTimeout(timeoutId)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken]) // connect e disconnect são estáveis via useCallback, enabled não deve disparar aqui

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

