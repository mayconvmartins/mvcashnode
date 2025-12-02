import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import type { ApiError } from '@/lib/types'

const apiClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000,
})

// Request interceptor para adicionar token
apiClient.interceptors.request.use(
    (config) => {
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('accessToken')
            if (token) {
                config.headers.Authorization = `Bearer ${token}`
            }
        }
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

// Response interceptor para refresh token e tratamento de erros
apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

        // Refresh token logic
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true

            try {
                if (typeof window !== 'undefined') {
                    const refreshToken = localStorage.getItem('refreshToken')

                    if (!refreshToken) {
                        throw new Error('No refresh token')
                    }

                    const { data } = await axios.post(
                        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010'}/auth/refresh`,
                        { refreshToken }
                    )

                    localStorage.setItem('accessToken', data.accessToken)
                    localStorage.setItem('refreshToken', data.refreshToken)

                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
                    }

                    return apiClient(originalRequest)
                }
            } catch (refreshError) {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('accessToken')
                    localStorage.removeItem('refreshToken')
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

// Função helper para retry em requisições críticas
export async function retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    let lastError: unknown

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await requestFn()
        } catch (error) {
            lastError = error
            if (i < maxRetries - 1) {
                await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)))
            }
        }
    }

    throw lastError
}

export { apiClient }
