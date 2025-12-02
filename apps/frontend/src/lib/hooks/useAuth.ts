import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { authService } from '@/lib/api/auth.service'
import { useAuthStore } from '@/lib/stores/authStore'
import { toast } from 'sonner'

export function useAuth() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { user, isAuthenticated, logout: logoutStore } = useAuthStore()

    const { data: currentUser, isLoading } = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: authService.getMe,
        enabled: isAuthenticated,
        retry: false,
    })

    const logoutMutation = useMutation({
        mutationFn: async () => {
            logoutStore()
            queryClient.clear()
        },
        onSuccess: () => {
            router.push('/login')
            toast.success('Logout realizado com sucesso')
        },
    })

    const updateProfileMutation = useMutation({
        mutationFn: authService.updateMe,
        onSuccess: (data) => {
            useAuthStore.getState().setUser(data)
            queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
            toast.success('Perfil atualizado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar perfil')
        },
    })

    return {
        user: currentUser || user,
        isLoading,
        isAuthenticated,
        logout: () => logoutMutation.mutate(),
        updateProfile: updateProfileMutation.mutate,
        isUpdatingProfile: updateProfileMutation.isPending,
    }
}

