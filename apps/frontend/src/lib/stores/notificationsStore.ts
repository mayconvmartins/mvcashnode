import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
    id: string
    type: NotificationType
    title: string
    message: string
    timestamp: Date
    read: boolean
    actionUrl?: string
}

interface NotificationsState {
    notifications: Notification[]
    unreadCount: number
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
    markAsRead: (id: string) => void
    markAllAsRead: () => void
    deleteNotification: (id: string) => void
    clearAll: () => void
}

export const useNotificationsStore = create<NotificationsState>()(
    persist(
        (set, get) => ({
            notifications: [],
            unreadCount: 0,

            addNotification: (notification) => {
                const newNotification: Notification = {
                    ...notification,
                    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date(),
                    read: false,
                }

                set((state) => ({
                    notifications: [newNotification, ...state.notifications].slice(0, 50), // Manter apenas as 50 mais recentes
                    unreadCount: state.unreadCount + 1,
                }))
            },

            markAsRead: (id) => {
                set((state) => ({
                    notifications: state.notifications.map((n) =>
                        n.id === id ? { ...n, read: true } : n
                    ),
                    unreadCount: Math.max(0, state.unreadCount - 1),
                }))
            },

            markAllAsRead: () => {
                set((state) => ({
                    notifications: state.notifications.map((n) => ({ ...n, read: true })),
                    unreadCount: 0,
                }))
            },

            deleteNotification: (id) => {
                set((state) => {
                    const notification = state.notifications.find((n) => n.id === id)
                    return {
                        notifications: state.notifications.filter((n) => n.id !== id),
                        unreadCount: notification && !notification.read 
                            ? Math.max(0, state.unreadCount - 1) 
                            : state.unreadCount,
                    }
                })
            },

            clearAll: () => {
                set({
                    notifications: [],
                    unreadCount: 0,
                })
            },
        }),
        {
            name: 'notifications-storage',
        }
    )
)
