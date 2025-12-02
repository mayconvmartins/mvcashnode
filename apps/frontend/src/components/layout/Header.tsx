'use client'

import { useThemeStore } from '@/lib/stores/themeStore'
import { Button } from '@/components/ui/button'
import { Moon, Sun, Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'

export function Header() {
    const { theme, toggleTheme } = useThemeStore()
    const pathname = usePathname()

    const getPageTitle = () => {
        switch (pathname) {
            case '/': return 'Dashboard'
            case '/accounts': return 'Contas de Exchange'
            case '/vaults': return 'Cofres Virtuais'
            case '/parameters': return 'Parâmetros de Trading'
            case '/webhooks': return 'Webhooks'
            case '/positions': return 'Posições'
            case '/limit-orders': return 'Ordens Limit'
            case '/operations': return 'Operações'
            case '/reports': return 'Relatórios'
            case '/admin': return 'Administração'
            default: return 'Trading Automation'
        }
    }

    return (
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
            <div className="flex items-center gap-4 lg:pl-0 pl-12">
                <h1 className="text-lg font-semibold">{getPageTitle()}</h1>
            </div>

            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
                </Button>

                <Button variant="ghost" size="icon" onClick={toggleTheme}>
                    {theme === 'dark' ? (
                        <Sun className="h-5 w-5" />
                    ) : (
                        <Moon className="h-5 w-5" />
                    )}
                </Button>
            </div>
        </header>
    )
}
