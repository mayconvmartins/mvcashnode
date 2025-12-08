'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter, usePathname } from 'next/navigation'
import { adminService } from '@/lib/api/admin.service'
import { useAuthStore } from '@/lib/stores/authStore'
import { apiClient } from '@/lib/api/client'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import type { User as UserType } from '@/lib/types'

export function UserSelector() {
    const router = useRouter()
    const pathname = usePathname()
    const { accessToken, setTokens, setUser } = useAuthStore()
    const [selectedUserId, setSelectedUserId] = useState<string>('')

    // Buscar lista de usuários
    const { data: usersData, isLoading } = useQuery({
        queryKey: ['admin', 'users', 'selector'],
        queryFn: () => adminService.listUsers({ limit: 100 }),
        enabled: pathname?.startsWith('/admin') ?? false,
    })

    const users = Array.isArray(usersData) ? usersData : (usersData?.data || [])

    // Mutation para fazer impersonation
    const impersonateMutation = useMutation({
        mutationFn: (userId: number) => adminService.impersonateUser(userId),
        onSuccess: async (data) => {
            // Salvar token original do admin antes de fazer impersonation
            if (accessToken && typeof window !== 'undefined') {
                localStorage.setItem('originalAdminToken', accessToken)
                localStorage.setItem('originalAdminRefreshToken', localStorage.getItem('refreshToken') || '')
            }

            // Usar o token de impersonation
            const impersonateToken = data.accessToken
            
            // Buscar dados do usuário com o token de impersonation
            try {
                const response = await apiClient.get('/users/me', {
                    headers: {
                        Authorization: `Bearer ${impersonateToken}`
                    }
                })
                
                const userData = response.data
                
                // Marcar que está em modo impersonation
                localStorage.setItem('isImpersonating', 'true')
                
                // Salvar token e usuário
                setTokens(impersonateToken, impersonateToken)
                setUser(userData)
                
                toast.success(`Agora você está logado como ${userData.email || userData.profile?.full_name || 'usuário'}`)
                
                // Redirecionar para a página inicial
                router.push('/')
            } catch (error: any) {
                console.error('Erro ao buscar dados do usuário:', error)
                toast.error('Erro ao fazer login como usuário')
            }
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao fazer login como usuário')
        },
    })

    const handleUserSelect = (userId: string) => {
        if (!userId || userId === '') return
        
        const userIdNum = parseInt(userId, 10)
        if (isNaN(userIdNum)) {
            toast.error('ID de usuário inválido')
            return
        }

        if (confirm(`Deseja fazer login como este usuário?`)) {
            impersonateMutation.mutate(userIdNum)
        } else {
            setSelectedUserId('')
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Carregando usuários...</span>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <Select
                value={selectedUserId}
                onValueChange={handleUserSelect}
                disabled={impersonateMutation.isPending}
            >
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Escolher usuário..." />
                </SelectTrigger>
                <SelectContent>
                    {users.length === 0 ? (
                        <SelectItem value="none" disabled>
                            Nenhum usuário encontrado
                        </SelectItem>
                    ) : (
                        users.map((user: UserType) => (
                            <SelectItem key={user.id} value={user.id.toString()}>
                                {user.profile?.full_name || user.email} ({user.email})
                            </SelectItem>
                        ))
                    )}
                </SelectContent>
            </Select>
            {impersonateMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
        </div>
    )
}

