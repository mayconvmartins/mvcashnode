import axios, { type AxiosError } from 'axios'

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

// Response interceptor para refresh token
apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as any

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true

            try {
                if (typeof window !== 'undefined') {
                    const refreshToken = localStorage.getItem('refreshToken')

                    if (!refreshToken) {
                        throw new Error('No refresh token')
                    }

                    const { data } = await axios.post(
                        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
                        { refreshToken }
                    )

                    localStorage.setItem('accessToken', data.accessToken)
                    localStorage.setItem('refreshToken', data.refreshToken)

                    originalRequest.headers.Authorization = `Bearer ${data.accessToken}`

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

        return Promise.reject(error)
    }
)

export { apiClient }
