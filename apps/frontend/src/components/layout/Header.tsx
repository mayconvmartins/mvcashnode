'use client'

import { User, Key, HelpCircle } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { WebSocketStatus } from '@/components/websocket/WebSocketStatus'
import { UserSelector } from '@/components/admin/UserSelector'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter } from 'next/navigation'

export function Header() {
    const { user, logout } = useAuth()
    const router = useRouter()
    const pathname = usePathname()
    
    // Verificar se está em páginas admin
    const isAdminPage = pathname?.startsWith('/admin') ?? false
    // Verificar se o usuário é admin
    const isAdmin = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'admin' || roleValue === 'ADMIN' || roleValue?.toLowerCase?.() === 'admin'
    })

    return (
        <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm px-4 lg:px-6 flex items-center justify-between sticky top-0 z-10">
            {/* Breadcrumbs - Desktop only */}
            <div className="flex items-center gap-4">
                <Breadcrumbs />
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
                {/* WebSocket Status */}
                <WebSocketStatus />
                
                {/* Mode Toggle - hidden on mobile */}
                <div className="hidden sm:block">
                    <ModeToggle />
                </div>
                
                {/* Theme Toggle */}
                <ThemeToggle />
                
                {/* Notification Bell */}
                <NotificationBell />
                
                {/* User Selector - Admin pages only */}
                {isAdminPage && isAdmin && (
                    <div className="hidden lg:block">
                        <UserSelector />
                    </div>
                )}

                {/* User Dropdown - Desktop only */}
                <div className="hidden lg:block">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                                </div>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium">{user?.profile?.full_name || 'Usuário'}</p>
                                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push('/profile')}>
                                <User className="mr-2 h-4 w-4" />
                                Perfil
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push('/setup-2fa')}>
                                <Key className="mr-2 h-4 w-4" />
                                Configurar 2FA
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push('/help')}>
                                <HelpCircle className="mr-2 h-4 w-4" />
                                Ajuda
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={logout} className="text-destructive">
                                Sair
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    )
}
