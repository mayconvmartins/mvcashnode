'use client'

import { useNotificationsStore } from '@/lib/stores/notificationsStore'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { CheckCheck, Trash2, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export function NotificationCenter() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } =
        useNotificationsStore()

    const getIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <CheckCircle className="h-5 w-5 text-green-500" />
            case 'error':
                return <AlertCircle className="h-5 w-5 text-destructive" />
            case 'warning':
                return <AlertTriangle className="h-5 w-5 text-yellow-500" />
            default:
                return <Info className="h-5 w-5 text-blue-500" />
        }
    }

    return (
        <div className="w-[380px] max-w-[95vw]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div>
                    <h3 className="font-semibold">Notificações</h3>
                    {unreadCount > 0 && (
                        <p className="text-sm text-muted-foreground">
                            {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={markAllAsRead}
                            className="h-8 text-xs"
                        >
                            <CheckCheck className="h-4 w-4 mr-1" />
                            Marcar todas
                        </Button>
                    )}
                    {notifications.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAll}
                            className="h-8 text-xs text-destructive hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Limpar
                        </Button>
                    )}
                </div>
            </div>

            {/* List */}
            <ScrollArea className="h-[400px]">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Info className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id}
                                className={cn(
                                    'p-4 hover:bg-accent/50 transition-colors cursor-pointer group relative',
                                    !notification.read && 'bg-accent/30'
                                )}
                                onClick={() => !notification.read && markAsRead(notification.id)}
                            >
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 mt-1">{getIcon(notification.type)}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <h4
                                                className={cn(
                                                    'text-sm font-medium',
                                                    !notification.read && 'font-semibold'
                                                )}
                                            >
                                                {notification.title}
                                            </h4>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    deleteNotification(notification.id)
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-1">
                                            {notification.message}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(notification.timestamp), {
                                                    addSuffix: true,
                                                    locale: ptBR,
                                                })}
                                            </span>
                                            {!notification.read && (
                                                <span className="h-2 w-2 rounded-full bg-primary"></span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    )
}
