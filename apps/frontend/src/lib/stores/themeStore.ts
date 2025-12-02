import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface ThemeState {
    theme: Theme
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            theme: 'dark',

            setTheme: (theme) => {
                if (typeof window !== 'undefined') {
                    document.documentElement.classList.toggle('dark', theme === 'dark')
                }
                set({ theme })
            },

            toggleTheme: () =>
                set((state) => {
                    const newTheme = state.theme === 'dark' ? 'light' : 'dark'
                    if (typeof window !== 'undefined') {
                        document.documentElement.classList.toggle('dark', newTheme === 'dark')
                    }
                    return { theme: newTheme }
                }),
        }),
        {
            name: 'theme-storage',
        }
    )
)
