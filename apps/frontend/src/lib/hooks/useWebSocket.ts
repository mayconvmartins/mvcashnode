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

/**
 * Constrói a URL do WebSocket de forma segura (versão simplificada)
 */
function buildWebSocketUrl(baseUrl: string, token?: string | null): string {
    if (!baseUrl || !baseUrl.trim()) {
        throw new Error('URL do WebSocket não fornecida')
    }

    let url = baseUrl.trim()

    // Detectar e normalizar protocolo
    const hasWssProtocol = url.startsWith('wss://')
    const hasWsProtocol = url.startsWith('ws://')
    
    // Remover protocolo existente para normalizar
    if (hasWssProtocol || hasWsProtocol) {
        url = url.replace(/^(ws|wss):\/\//, '')
    }

    // Detectar protocolo correto baseado no ambiente
    let protocol: 'ws' | 'wss' = 'ws'
    
    if (typeof window !== 'undefined') {
        // Se a página está em HTTPS, usar wss://
        if (window.location.protocol === 'https:') {
            protocol = 'wss'
        }
        // Se a URL original tinha wss://, manter wss://
        if (hasWssProtocol) {
            protocol = 'wss'
        }
    } else if (hasWssProtocol) {
        // No servidor (SSR), usar wss:// se a URL original tinha
        protocol = 'wss'
    }

    // Construir URL completa com protocolo
    const urlWithProtocol = `${protocol}://${url}`

    // Criar objeto URL para validação e manipulação
    let wsUrl: URL
    try {
        wsUrl = new URL(urlWithProtocol)
    } catch (urlError) {
        throw new Error(
            `URL do WebSocket inválida: ${urlWithProtocol}. ` +
            `Erro: ${urlError instanceof Error ? urlError.message : String(urlError)}`
        )
    }

    // Validar hostname
    if (!wsUrl.hostname || wsUrl.hostname === '') {
        throw new Error(`URL do WebSocket inválida: hostname não encontrado em ${baseUrl}`)
    }

    // Garantir que o path seja /ws (ou manter o path existente se já tiver /ws)
    if (!wsUrl.pathname || wsUrl.pathname === '/' || !wsUrl.pathname.includes('/ws')) {
        wsUrl.pathname = '/ws'
    } else if (wsUrl.pathname.endsWith('/ws/')) {
        wsUrl.pathname = '/ws'
    }

    // Adicionar token na query string se fornecido
    if (token) {
        wsUrl.searchParams.set('token', token)
    }

    const finalUrl = wsUrl.toString()

    // Validação final
    if (!finalUrl.startsWith('ws://') && !finalUrl.startsWith('wss://')) {
        throw new Error(
            `URL final inválida (deve começar com ws:// ou wss://): ${finalUrl.replace(/token=[^&]+/, 'token=***')}`
        )
    }

    return finalUrl
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
            let finalUrl: string
            try {
                // Construir URL do WebSocket de forma segura
                finalUrl = buildWebSocketUrl(url, accessToken)

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
                    // Detectar erro específico ERR_UNKNOWN_URL_SCHEME
                    const errorMessage = error instanceof Error ? error.message : String(error)
                    const isUnknownUrlScheme = errorMessage.includes('ERR_UNKNOWN_URL_SCHEME') || 
                                              errorMessage.includes('Unknown URL scheme')
                    
                    if (isUnknownUrlScheme) {
                        console.error('❌ WebSocket error: ERR_UNKNOWN_URL_SCHEME - URL malformada ou protocolo inválido')
                        console.error('❌ URL tentada:', finalUrl.replace(/token=[^&]+/, 'token=***'))
                        console.error('❌ Isso geralmente indica que a URL não começa com ws:// ou wss://')
                        
                        // Fechar conexão imediatamente
                        try {
                            ws.close(1002, 'ERR_UNKNOWN_URL_SCHEME')
                        } catch (closeError) {
                            console.warn('⚠️ Erro ao fechar WebSocket após ERR_UNKNOWN_URL_SCHEME:', closeError)
                        }
                    }
                    
                    onError?.(error)
                }

                ws.onclose = (event) => {
                    setIsConnected(false)
                    onClose?.()

                    // Não reconectar se foi erro não-recuperável
                    const closeCode = event.code
                    const closeReason = event.reason || ''
                    const isNonRecoverable = closeCode === 1002 || 
                                            closeReason.includes('ERR_UNKNOWN_URL_SCHEME') ||
                                            closeReason.includes('Invalid token') ||
                                            closeReason.includes('Authentication required')

                    // Tentar reconectar apenas se não for erro não-recuperável
                    if (!isNonRecoverable && reconnectAttempts < maxReconnectAttempts) {
                        reconnectTimeoutRef.current = setTimeout(() => {
                            setReconnectAttempts((prev) => prev + 1)
                            connect()
                        }, reconnectInterval)
                    } else if (isNonRecoverable) {
                        console.warn('⚠️ WebSocket fechado por erro não-recuperável, não tentando reconectar')
                    }
                }

                wsRef.current = ws
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                console.error('❌ WebSocket connection error:', errorMessage)
                
                // Detectar erros de URL
                if (errorMessage.includes('URL')) {
                    console.error('❌ Erro de URL do WebSocket:', errorMessage)
                    console.error('❌ URL base fornecida:', url)
                }
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

