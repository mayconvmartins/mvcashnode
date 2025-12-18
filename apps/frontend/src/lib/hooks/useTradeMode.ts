import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TradeMode } from '@/lib/types'
import { useAuthStore } from '@/lib/stores/authStore'

interface TradeModeState {
    tradeMode: TradeMode
    setTradeMode: (mode: TradeMode) => void
    toggle: () => void
}

export const useTradeModeStore = create<TradeModeState>()(
    persist(
        (set) => ({
            tradeMode: TradeMode.REAL,
            setTradeMode: (mode) => set({ tradeMode: mode }),
            toggle: () =>
                set((state) => ({
                    tradeMode: state.tradeMode === TradeMode.REAL ? TradeMode.SIMULATION : TradeMode.REAL,
                })),
        }),
        {
            name: 'trade-mode-storage',
        }
    )
)

export function useTradeMode() {
    const { tradeMode, setTradeMode, toggle } = useTradeModeStore()
    const { user } = useAuthStore()
    
    // Verificar se é assinante (não admin)
    const isSubscriber = user?.roles?.some((r: any) => r.role === 'subscriber')
    const isAdmin = user?.roles?.some((r: any) => r.role === 'admin')
    const isSubscriberOnly = isSubscriber && !isAdmin
    
    // Assinantes só podem usar modo REAL
    const effectiveTradeMode = isSubscriberOnly ? TradeMode.REAL : tradeMode
    const canChangeMode = !isSubscriberOnly

    return {
        tradeMode: effectiveTradeMode,
        setTradeMode: canChangeMode ? setTradeMode : () => {}, // Bloquear mudança para assinantes
        toggle: canChangeMode ? toggle : () => {},
        isReal: effectiveTradeMode === TradeMode.REAL,
        isSimulation: effectiveTradeMode === TradeMode.SIMULATION,
        canChangeMode, // Expor flag para ocultar seletor
        isSubscriberOnly,
    }
}

