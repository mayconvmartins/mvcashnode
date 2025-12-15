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

/**
 * Decodifica um token JWT sem verificar assinatura (apenas para ler payload)
 */
function decodeJWT(token: string): { exp?: number; userId?: number; [key: string]: any } | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) {
            return null
        }
        const payload = parts[1]
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
        return decoded
    } catch (error) {
        console.error('Erro ao decodificar token JWT:', error)
        return null
    }
}

/**
 * Verifica se um token JWT está expirado ou próximo de expirar
 * @param token Token JWT
 * @param bufferSeconds Segundos de buffer antes da expiração (padrão: 60s)
 * @returns true se o token está válido, false se expirado ou inválido
 */
function isTokenValid(token: string | null, bufferSeconds: number = 60): boolean {
    if (!token) {
        return false
    }

    const decoded = decodeJWT(token)
    if (!decoded || !decoded.exp) {
        return false
    }

    const expirationTime = decoded.exp * 1000 // Converter para milissegundos
    const currentTime = Date.now()
    const bufferTime = bufferSeconds * 1000

    // Token é válido se ainda não expirou (com buffer)
    return currentTime < (expirationTime - bufferTime)
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
    const isConnectingRef = useRef(false) // Flag para evitar múltiplas tentativas simultâneas
    const shouldReconnectRef = useRef(true) // Flag para controlar se deve reconectar
    const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastReconnectTimeRef = useRef<number>(0) // Para debounce

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

        // Resetar contador de heartbeats perdidos ao iniciar
        missedHeartbeatsRef.current = 0

        heartbeatIntervalRef.current = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                try {
                    wsRef.current.send(JSON.stringify({ type: 'ping' }))
                    missedHeartbeatsRef.current++

                    if (missedHeartbeatsRef.current >= 3) {
                        console.warn('❌ WebSocket: Too many missed heartbeats, closing connection')
                        wsRef.current.close(1006, 'Heartbeat timeout')
                    }
                } catch (error) {
                    console.error('❌ Erro ao enviar heartbeat:', error)
                    // Se houver erro ao enviar, considerar como heartbeat perdido
                    missedHeartbeatsRef.current++
                }
            } else {
                // Se o socket não está aberto, parar o heartbeat
                stopHeartbeat()
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
        // Verificar se está habilitado e se há URL
        if (!enabled || !url) {
            console.log('🔌 WebSocket connection skipped:', { enabled, url })
            return
        }

        // Verificar se já está conectando (debounce)
        if (isConnectingRef.current) {
            console.log('🔌 WebSocket already connecting, skipping duplicate attempt')
            return
        }

        // Verificar se não deve reconectar (erro não-recuperável)
        if (!shouldReconnectRef.current) {
            console.log('🔌 WebSocket reconnection disabled due to non-recoverable error')
            return
        }

        // Não conectar se não houver token - aguardar token estar disponível
        if (!accessToken) {
            console.log('🔌 WebSocket connection skipped: no access token available')
            return
        }

        // Validar token antes de conectar
        if (!isTokenValid(accessToken)) {
            console.warn('⚠️ WebSocket connection skipped: token expired or invalid')
            shouldReconnectRef.current = false // Não tentar reconectar com token inválido
            toast.error('Token expirado. Por favor, faça login novamente.', {
                duration: 5000,
            })
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

        // Debounce: evitar reconexões muito frequentes (mínimo 1 segundo entre tentativas)
        const now = Date.now()
        const timeSinceLastReconnect = now - lastReconnectTimeRef.current
        if (timeSinceLastReconnect < 1000 && lastReconnectTimeRef.current > 0) {
            console.log(`🔌 WebSocket reconnection debounced (${timeSinceLastReconnect}ms since last attempt)`)
            return
        }
        lastReconnectTimeRef.current = now

        // Marcar como conectando
        isConnectingRef.current = true

        // Fechar conexão anterior se existir
        if (wsRef.current) {
            console.log('🔌 Closing existing WebSocket connection before reconnecting')
            try {
                wsRef.current.onclose = null
                wsRef.current.onerror = null
                wsRef.current.onmessage = null
                wsRef.current.onopen = null
                if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
                    wsRef.current.close(1000, 'Reconnecting')
                }
            } catch (error) {
                console.warn('⚠️ Erro ao fechar conexão anterior:', error)
            }
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
            
            // Remover protocolo ws:// ou wss:// se já estiver presente para normalizar
            baseUrl = baseUrl.replace(/^(ws|wss):\/\//, '')
            
            // Detectar protocolo baseado no ambiente
            let protocol = 'ws:'
            if (typeof window !== 'undefined') {
                // Se a página estiver em HTTPS, usar wss://
                if (window.location.protocol === 'https:') {
                    protocol = 'wss:'
                }
                // Se a URL original tinha wss://, manter
                if (url.trim().startsWith('wss://')) {
                    protocol = 'wss:'
                }
            }
            
            // Construir URL completa
            const fullBaseUrl = `${protocol}//${baseUrl}`
            
            // Criar objeto URL com validação
            let wsUrl: URL
            try {
                wsUrl = new URL(fullBaseUrl)
            } catch (urlError) {
                console.error('❌ [WebSocket] Erro ao criar objeto URL:', urlError, 'URL:', fullBaseUrl)
                throw new Error(`URL inválida: ${fullBaseUrl}. Erro: ${urlError instanceof Error ? urlError.message : String(urlError)}`)
            }
            
            // Garantir que o path seja sempre /ws (conforme gateway configurado)
            // Se o path já contém /ws, não duplicar
            if (!wsUrl.pathname || wsUrl.pathname === '/' || !wsUrl.pathname.includes('/ws')) {
                // Se já tem /ws no final, não adicionar
                if (wsUrl.pathname.endsWith('/ws')) {
                    // Já está correto
                } else if (wsUrl.pathname.endsWith('/ws/')) {
                    wsUrl.pathname = '/ws'
                } else {
                    wsUrl.pathname = '/ws'
                }
            }
            
            // Validar que temos um hostname
            if (!wsUrl.hostname || wsUrl.hostname === '') {
                throw new Error(`URL inválida: hostname não encontrado em ${baseUrl}`)
            }
            
            // Log da porta (para debug)
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
            
            if (!finalUrl.includes('/ws')) {
                throw new Error(`Path /ws não encontrado na URL final: ${finalUrl.replace(/token=[^&]+/, 'token=***')}`)
            }

            console.log('🔌 [WebSocket] Conectando:', {
                hostname: wsUrl.hostname,
                port: wsUrl.port || 'default',
                pathname: wsUrl.pathname,
                protocol: wsUrl.protocol,
                hasToken: true,
                url: finalUrl.replace(/token=[^&]+/, 'token=***'),
            })

            const ws = new WebSocket(finalUrl)
            
            // Limpar timeout anterior se existir
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current)
            }
            
            // Timeout de conexão (15 segundos - aumentado para produção)
            connectionTimeoutRef.current = setTimeout(() => {
                if (ws.readyState === WebSocket.CONNECTING) {
                    console.warn('⚠️ WebSocket connection timeout após 15s')
                    isConnectingRef.current = false
                    ws.close(1006, 'Connection timeout')
                }
            }, 15000)

            ws.onopen = () => {
                if (connectionTimeoutRef.current) {
                    clearTimeout(connectionTimeoutRef.current)
                    connectionTimeoutRef.current = null
                }
                isConnectingRef.current = false
                console.log('✅ WebSocket connection opened')
                setIsConnected(true)
                reconnectAttemptsRef.current = 0
                setReconnectAttempts(0)
                shouldReconnectRef.current = true // Resetar flag de reconexão
                startHeartbeat()
                toast.success('WebSocket conectado', { duration: 2000 })
            }

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data)

                    // Tratar mensagem de conexão bem-sucedida
                    if (message.type === 'connected') {
                        console.log('✅ WebSocket connection confirmed:', message.message)
                        missedHeartbeatsRef.current = 0 // Resetar contador de heartbeats
                        return
                    }

                    // Reset heartbeat counter on pong
                    if (message.type === 'pong') {
                        missedHeartbeatsRef.current = 0
                        return
                    }

                    // Reset heartbeat counter em qualquer mensagem válida (indica conexão ativa)
                    missedHeartbeatsRef.current = 0

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
                isConnectingRef.current = false
                if (connectionTimeoutRef.current) {
                    clearTimeout(connectionTimeoutRef.current)
                    connectionTimeoutRef.current = null
                }
                console.error('❌ WebSocket error:', {
                    type: error.type,
                    target: error.target,
                    readyState: wsRef.current?.readyState,
                })
                // Não fechar a conexão aqui, deixar o onclose lidar com isso
            }

            ws.onclose = (event) => {
                isConnectingRef.current = false
                if (connectionTimeoutRef.current) {
                    clearTimeout(connectionTimeoutRef.current)
                    connectionTimeoutRef.current = null
                }
                
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

                // Não reconectar se não deve reconectar
                if (!shouldReconnectRef.current) {
                    console.log('🔌 Reconnection disabled, skipping')
                    return
                }

                // Códigos de erro não-recuperáveis (não tentar reconectar)
                const nonRecoverableCodes = [1008, 1011, 1002, 1003] // Policy violation, Internal error, Protocol error, Unsupported data
                const isNonRecoverable = nonRecoverableCodes.includes(closeCode) || 
                                        closeReason.includes('Invalid token') ||
                                        closeReason.includes('Authentication required') ||
                                        closeReason.includes('User not found') ||
                                        closeReason.includes('User inactive')

                if (isNonRecoverable) {
                    console.warn(`⚠️ WebSocket fechado por erro não-recuperável (código ${closeCode}): ${closeReason}`)
                    shouldReconnectRef.current = false
                    toast.error(`Erro de conexão: ${closeReason}`, {
                        duration: 5000,
                    })
                    return
                }

                // Auto-reconnect com backoff exponencial
                const currentAttempts = reconnectAttemptsRef.current
                if (enabled && currentAttempts < maxReconnectAttempts && shouldReconnectRef.current) {
                    // Backoff exponencial: 3s, 6s, 12s, 24s, 30s (max)
                    const baseDelay = reconnectInterval
                    const exponentialDelay = Math.min(baseDelay * Math.pow(2, currentAttempts), 30000)
                    const jitter = Math.random() * 1000 // Adicionar jitter para evitar thundering herd
                    const delay = exponentialDelay + jitter
                    
                    console.log(`🔄 Reconnecting in ${Math.round(delay)}ms... (attempt ${currentAttempts + 1}/${maxReconnectAttempts})`)
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        // Verificar novamente se ainda está montado e habilitado antes de reconectar
                        if (isMountedRef.current && enabled && shouldReconnectRef.current) {
                            reconnectAttemptsRef.current++
                            setReconnectAttempts(reconnectAttemptsRef.current)
                            connect()
                        }
                    }, delay)
                } else if (currentAttempts >= maxReconnectAttempts) {
                    console.warn(`⚠️ Max WebSocket reconnection attempts reached (${maxReconnectAttempts})`)
                    shouldReconnectRef.current = false
                    toast.error('Falha ao conectar WebSocket após múltiplas tentativas', {
                        duration: 5000,
                    })
                }
            }

            wsRef.current = ws
        } catch (error) {
            isConnectingRef.current = false
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('❌ Error creating WebSocket connection:', errorMessage)
            setIsConnected(false)
            
            // Determinar se o erro é recuperável
            const isRecoverable = !errorMessage.includes('Invalid WebSocket URL') &&
                                 !errorMessage.includes('Token expirado') &&
                                 !errorMessage.includes('token expired')
            
            if (!isRecoverable) {
                shouldReconnectRef.current = false
            }
            
            // Mostrar mensagem de erro mais clara para o usuário
            if (errorMessage.includes('Invalid WebSocket URL')) {
                toast.error('URL do WebSocket inválida. Verifique a configuração.', {
                    duration: 5000,
                })
            } else if (errorMessage.includes('Token expirado') || errorMessage.includes('token expired')) {
                toast.error('Token expirado. Por favor, faça login novamente.', {
                    duration: 5000,
                })
            } else {
                toast.error(`Erro ao conectar WebSocket: ${errorMessage}`, {
                    duration: 5000,
                })
            }
            
            // Tentar reconectar após um delay apenas se o erro for recuperável
            if (isMountedRef.current && enabled && isRecoverable && shouldReconnectRef.current) {
                const currentAttempts = reconnectAttemptsRef.current
                if (currentAttempts < maxReconnectAttempts) {
                    // Backoff exponencial
                    const baseDelay = reconnectInterval
                    const exponentialDelay = Math.min(baseDelay * Math.pow(2, currentAttempts), 30000)
                    const delay = exponentialDelay
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (isMountedRef.current && enabled && shouldReconnectRef.current) {
                            reconnectAttemptsRef.current++
                            setReconnectAttempts(reconnectAttemptsRef.current)
                            connect()
                        }
                    }, delay)
                }
            }
        }
    }, [enabled, url, accessToken, maxReconnectAttempts, reconnectInterval, handleMessage, startHeartbeat, stopHeartbeat])

    // Disconnect
    const disconnect = useCallback(() => {
        console.log('🔌 Disconnecting WebSocket...')
        isMountedRef.current = false
        shouldReconnectRef.current = false // Desabilitar reconexão ao desconectar manualmente
        isConnectingRef.current = false
        
        // Limpar todos os timeouts
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
        }
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current)
            connectionTimeoutRef.current = null
        }
        
        stopHeartbeat()
        
        if (wsRef.current) {
            // Remover listeners para evitar chamadas após desconexão
            wsRef.current.onclose = null
            wsRef.current.onerror = null
            wsRef.current.onmessage = null
            wsRef.current.onopen = null
            
            try {
                if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
                    wsRef.current.close(1000, 'Client disconnecting')
                }
            } catch (error) {
                console.warn('⚠️ Erro ao fechar WebSocket:', error)
            }
            wsRef.current = null
        }
        setIsConnected(false)
        reconnectAttemptsRef.current = 0
        setReconnectAttempts(0)
        lastReconnectTimeRef.current = 0
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
        shouldReconnectRef.current = true // Habilitar reconexão ao montar
        
        if (autoConnect && enabled) {
            // Aguardar token estar disponível e válido antes de conectar
            const timeoutId = setTimeout(() => {
                if (isMountedRef.current && accessToken && isTokenValid(accessToken)) {
                    reconnectAttemptsRef.current = 0
                    setReconnectAttempts(0)
                    connect()
                } else if (isMountedRef.current && !accessToken) {
                    console.log('🔌 WebSocket: Waiting for access token before connecting...')
                } else if (isMountedRef.current && accessToken && !isTokenValid(accessToken)) {
                    console.warn('⚠️ WebSocket: Token inválido ou expirado, não conectando')
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
        if (enabled && accessToken && isTokenValid(accessToken) && wsRef.current && tokenChanged) {
            const currentState = wsRef.current.readyState
            // Apenas reconectar se realmente estiver conectado (não apenas conectando)
            if (currentState === WebSocket.OPEN) {
                console.log('🔌 Token changed, reconnecting WebSocket...')
                disconnect()
                // Reconectar após um pequeno delay
                const timeoutId = setTimeout(() => {
                    if (isMountedRef.current && enabled && accessToken && isTokenValid(accessToken)) {
                        shouldReconnectRef.current = true
                        reconnectAttemptsRef.current = 0
                        setReconnectAttempts(0)
                        connect()
                    }
                }, 500)
                
                return () => {
                    clearTimeout(timeoutId)
                }
            }
        } else if (enabled && accessToken && isTokenValid(accessToken) && !wsRef.current && tokenChanged) {
            // Se não há conexão mas temos token válido, tentar conectar (primeira vez ou após desconexão)
            // Mas apenas se o token realmente mudou ou é a primeira vez
            const timeoutId = setTimeout(() => {
                if (isMountedRef.current && enabled && accessToken && isTokenValid(accessToken) && !wsRef.current) {
                    console.log('🔌 Token available, connecting WebSocket...')
                    shouldReconnectRef.current = true
                    reconnectAttemptsRef.current = 0
                    setReconnectAttempts(0)
                    connect()
                }
            }, 100)
            
            return () => {
                clearTimeout(timeoutId)
            }
        } else if (enabled && accessToken && !isTokenValid(accessToken) && tokenChanged) {
            // Token expirado - não tentar conectar
            console.warn('⚠️ WebSocket: Token expirado, não conectando')
            shouldReconnectRef.current = false
            if (wsRef.current) {
                disconnect()
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

