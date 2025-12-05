import axios, { type AxiosError, type AxiosRequestConfig, CancelTokenSource } from 'axios'
import type { ApiError } from '@/lib/types'

// Request deduplication: cancelar requisições duplicadas
const pendingRequests = new Map<string, CancelTokenSource>()

function getRequestKey(config: AxiosRequestConfig): string {
    return `${config.method?.toUpperCase() || 'GET'}_${config.url}_${JSON.stringify(config.params || {})}_${JSON.stringify(config.data || {})}`
}

// Sanitizar strings para prevenir XSS
const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
}

// Sanitizar objeto recursivamente
const sanitizeObject = (obj: any): any => {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'string') return sanitizeString(obj)
    if (Array.isArray(obj)) return obj.map(sanitizeObject)
    if (typeof obj === 'object') {
        const sanitized: any = {}
        for (const key of Object.keys(obj)) {
            sanitized[key] = sanitizeObject(obj[key])
        }
        return sanitized
    }
    return obj
}

const apiClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010',
    headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Proteção básica CSRF
    },
    timeout: 10000, // 10 segundos para requisições normais (reduzido de 30s)
    withCredentials: false, // Não enviar cookies automaticamente
})

// Request interceptor para adicionar token, sanitizar dados e deduplicação
apiClient.interceptors.request.use(
    (config) => {
        // Request deduplication: cancelar requisições duplicadas pendentes
        const requestKey = getRequestKey(config)
        const pendingRequest = pendingRequests.get(requestKey)
        
        if (pendingRequest) {
            // Cancelar requisição anterior
            pendingRequest.cancel('Request deduplication: nova requisição substitui a anterior')
            pendingRequests.delete(requestKey)
        }
        
        // Criar novo cancel token para esta requisição
        const cancelTokenSource = axios.CancelToken.source()
        config.cancelToken = cancelTokenSource.token
        pendingRequests.set(requestKey, cancelTokenSource)
        
        // Timeout maior para operações longas (uploads, auditorias, etc)
        if (config.data instanceof FormData || config.timeout === undefined) {
            config.timeout = 60000 // 60 segundos para uploads
        }
        // Se o timeout foi explicitamente definido na requisição, usar esse valor
        if (config.timeout && config.timeout > 10000) {
            // Timeout customizado já definido, manter
        }
        
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('accessToken')
            if (token) {
                // Validar formato do token (JWT básico)
                if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token)) {
                    config.headers.Authorization = `Bearer ${token}`
                } else {
                    // Token inválido, remover tudo incluindo flags de impersonation
                    localStorage.removeItem('accessToken')
                    localStorage.removeItem('refreshToken')
                    localStorage.removeItem('isImpersonating')
                    localStorage.removeItem('originalAdminToken')
                }
            }
        }
        
        // Sanitizar dados de entrada para prevenir XSS no backend
        if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
            // Não sanitizar senhas ou campos específicos
            const sensitiveFields = ['password', 'api_key', 'api_secret', 'signing_secret']
            const sanitizedData: any = {}
            
            for (const key of Object.keys(config.data)) {
                if (sensitiveFields.includes(key)) {
                    sanitizedData[key] = config.data[key]
                } else {
                    sanitizedData[key] = sanitizeObject(config.data[key])
                }
            }
            
            config.data = sanitizedData
        }
        
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

// Response interceptor para extrair data, refresh token e limpar deduplicação
apiClient.interceptors.response.use(
    (response) => {
        // Limpar requisição pendente após sucesso
        const requestKey = getRequestKey(response.config)
        pendingRequests.delete(requestKey)
        
        // Backend retorna { data: {...} }, então extraímos o data interno
        // MAS: se a resposta já tem pagination (PaginatedResponse), não extrair
        if (response.data && typeof response.data === 'object' && 'data' in response.data) {
            // Se tem pagination, é uma resposta paginada, manter como está
            if ('pagination' in response.data) {
                // Já está no formato correto { data: [...], pagination: {...} }
                return response
            }
            // Caso contrário, extrair o data interno
            response.data = response.data.data
        }
        return response
    },
    async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean; _retryTwice?: boolean }
        
        // Limpar requisição pendente após erro (exceto se for cancelamento)
        if (originalRequest && !axios.isCancel(error)) {
            const requestKey = getRequestKey(originalRequest)
            pendingRequests.delete(requestKey)
        }
        
        // Ignorar erros de cancelamento (deduplicação)
        if (axios.isCancel(error)) {
            return Promise.reject(error)
        }

        // Refresh token logic
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true

            try {
                if (typeof window !== 'undefined') {
                    const refreshToken = localStorage.getItem('refreshToken')
                    const rememberMe = localStorage.getItem('rememberMe') === 'true'

                    if (!refreshToken) {
                        throw new Error('No refresh token')
                    }

                    const { data } = await axios.post(
                        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010'}/auth/refresh`,
                        { refreshToken }
                    )

                    // Atualizar tokens no localStorage
                    localStorage.setItem('accessToken', data.accessToken)
                    localStorage.setItem('refreshToken', data.refreshToken)

                    // Atualizar tokens no authStore se disponível (pode não estar disponível em SSR)
                    try {
                        const { useAuthStore } = await import('@/lib/stores/authStore')
                        const store = useAuthStore.getState()
                        if (store.setTokens) {
                            store.setTokens(data.accessToken, data.refreshToken, rememberMe)
                        }
                    } catch (storeError) {
                        // Se não conseguir importar o store, continuar normalmente
                        console.warn('[API-CLIENT] Não foi possível atualizar authStore:', storeError)
                    }

                    // Atualizar cookies
                    const expiresAccess = new Date()
                    if (rememberMe) {
                        expiresAccess.setDate(expiresAccess.getDate() + 30) // 30 dias com rememberMe
                    } else {
                        expiresAccess.setDate(expiresAccess.getDate() + 7) // 7 dias sem rememberMe
                    }
                    document.cookie = `accessToken=${data.accessToken}; path=/; expires=${expiresAccess.toUTCString()}; SameSite=Lax`
                    
                    const expiresRefresh = new Date()
                    expiresRefresh.setDate(expiresRefresh.getDate() + 30) // 30 dias (sempre)
                    document.cookie = `refreshToken=${data.refreshToken}; path=/; expires=${expiresRefresh.toUTCString()}; SameSite=Lax`

                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
                    }

                    return apiClient(originalRequest)
                }
            } catch (refreshError) {
                if (typeof window !== 'undefined') {
                    const rememberMe = localStorage.getItem('rememberMe') === 'true'
                    
                    // Se rememberMe está ativo, tentar mais uma vez antes de redirecionar
                    // (pode ser um problema temporário de rede)
                    if (rememberMe && !originalRequest._retryTwice) {
                        originalRequest._retryTwice = true
                        console.log('[API-CLIENT] Refresh falhou com rememberMe ativo, tentando novamente...')
                        
                        // Aguardar um pouco antes de tentar novamente
                        await new Promise(resolve => setTimeout(resolve, 1000))
                        
                        try {
                            const refreshToken = localStorage.getItem('refreshToken')
                            if (refreshToken) {
                                const { data } = await axios.post(
                                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010'}/auth/refresh`,
                                    { refreshToken }
                                )
                                
                                localStorage.setItem('accessToken', data.accessToken)
                                localStorage.setItem('refreshToken', data.refreshToken)
                                
                                // Atualizar authStore
                                try {
                                    const { useAuthStore } = await import('@/lib/stores/authStore')
                                    const store = useAuthStore.getState()
                                    if (store.setTokens) {
                                        store.setTokens(data.accessToken, data.refreshToken, rememberMe)
                                    }
                                } catch (storeError) {
                                    console.warn('[API-CLIENT] Não foi possível atualizar authStore:', storeError)
                                }
                                
                                // Atualizar cookies
                                const expiresAccess = new Date()
                                expiresAccess.setDate(expiresAccess.getDate() + 30)
                                document.cookie = `accessToken=${data.accessToken}; path=/; expires=${expiresAccess.toUTCString()}; SameSite=Lax`
                                
                                const expiresRefresh = new Date()
                                expiresRefresh.setDate(expiresRefresh.getDate() + 30)
                                document.cookie = `refreshToken=${data.refreshToken}; path=/; expires=${expiresRefresh.toUTCString()}; SameSite=Lax`
                                
                                if (originalRequest.headers) {
                                    originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
                                }
                                
                                return apiClient(originalRequest)
                            }
                        } catch (retryError) {
                            console.error('[API-CLIENT] Segunda tentativa de refresh também falhou:', retryError)
                        }
                    }
                    
                    // Limpar todos os tokens e flags de impersonation
                    localStorage.removeItem('accessToken')
                    localStorage.removeItem('refreshToken')
                    localStorage.removeItem('rememberMe')
                    localStorage.removeItem('isImpersonating')
                    localStorage.removeItem('originalAdminToken')
                    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
                    document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
                    window.location.href = '/login'
                }
                return Promise.reject(refreshError)
            }
        }

        // Padronizar formato de erro
        const apiError: ApiError = {
            statusCode: error.response?.status || 500,
            message:
                error.response?.data?.message ||
                error.message ||
                'Ocorreu um erro inesperado',
            error: error.response?.data?.error || 'Internal Server Error',
        }

        return Promise.reject(apiError)
    }
)

// Função helper para retry em requisições críticas com backoff exponencial
export async function retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
): Promise<T> {
    let lastError: unknown

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await requestFn()
        } catch (error) {
            lastError = error
            if (i < maxRetries - 1) {
                // Backoff exponencial: 1s, 2s, 4s, etc (máximo 30s)
                const delay = Math.min(baseDelay * Math.pow(2, i), 30000)
                await new Promise((resolve) => setTimeout(resolve, delay))
            }
        }
    }

    throw lastError
}

export { apiClient }
