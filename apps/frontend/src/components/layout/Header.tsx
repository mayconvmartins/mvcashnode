'use client'

import { User } from 'lucide-react'
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
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter } from 'next/navigation'

export function Header() {
    const { user, logout } = useAuth()
    const router = useRouter()

    return (
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm px-6 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-4">
                <h1 className="text-lg font-semibold">Trading Automation</h1>
            </div>

            <div className="flex items-center gap-4">
                <WebSocketStatus />
                <ModeToggle />
                <ThemeToggle />
                <NotificationBell />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <User className="h-5 w-5" />
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
                            Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push('/setup-2fa')}>
                            Configurar 2FA
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout} className="text-destructive">
                            Sair
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    )
}
