import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TradeMode } from '@/lib/types'

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

    return {
        tradeMode,
        setTradeMode,
        toggle,
        isReal: tradeMode === TradeMode.REAL,
        isSimulation: tradeMode === TradeMode.SIMULATION,
    }
}

