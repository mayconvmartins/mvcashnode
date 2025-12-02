import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { ReactNode } from 'react'

// Mock do authService
jest.mock('@/lib/api/auth.service', () => ({
  authService: {
    getMe: jest.fn(() => Promise.resolve({
      id: 1,
      email: 'test@example.com',
      roles: ['user'],
      profile: {
        full_name: 'Test User',
      },
    })),
  },
}))

// Mock do authStore
jest.mock('@/lib/stores/authStore', () => ({
  useAuthStore: () => ({
    user: null,
    accessToken: 'mock-token',
    isAuthenticated: true,
    setUser: jest.fn(),
    logout: jest.fn(),
  }),
}))

describe('useAuth', () => {
  const wrapper = ({ children }: { children: ReactNode }) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  it('retorna dados do usuário quando autenticado', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })
  })

  it('fornece função de logout', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(typeof result.current.logout).toBe('function')
  })
})

