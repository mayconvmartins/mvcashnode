'use client'

import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { NotificationCenter } from './NotificationCenter'
import { useNotificationsStore } from '@/lib/stores/notificationsStore'
import { cn } from '@/lib/utils'

export function NotificationBell() {
    const { unreadCount } = useNotificationsStore()

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className={cn(
                            "absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center",
                            unreadCount > 9 && "w-6"
                        )}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
                <NotificationCenter />
            </PopoverContent>
        </Popover>
    )
}
