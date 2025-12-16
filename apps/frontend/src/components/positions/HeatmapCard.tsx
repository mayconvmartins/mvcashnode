'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format'
import { Coins } from 'lucide-react'
import type { Position } from '@/lib/types'

interface HeatmapCardProps {
  position: Position
  logoUrl: string | null
}

/**
 * Calcula a cor do card baseado no PNL%
 */
function getHeatmapColor(pnlPct: number): string {
  if (pnlPct < -5) return 'from-red-900/90 to-red-800/80'
  if (pnlPct < -2) return 'from-red-700/90 to-red-600/80'
  if (pnlPct < 0) return 'from-yellow-500/90 to-yellow-400/80' // -2% a 0%: amarelo
  // Positivas sempre verde (variando intensidade)
  if (pnlPct < 2) return 'from-green-500/90 to-green-600/80'
  if (pnlPct < 5) return 'from-green-600/90 to-green-700/80'
  if (pnlPct < 10) return 'from-green-700/90 to-green-800/90'
  return 'from-green-800/90 to-green-900/90'
}

/**
 * Calcula a cor do texto baseado no PNL%
 */
function getTextColor(pnlPct: number): string {
  if (pnlPct < -2) return 'text-red-100'
  if (pnlPct < 0) return 'text-yellow-100' // -2% a 0%: texto amarelo
  return 'text-green-100' // Positivas sempre verde
}

export function HeatmapCard({ position, logoUrl }: HeatmapCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  // Calcular PNL%
  const pnlPct = position.unrealized_pnl_pct ?? 0
  const unrealizedPnl = position.unrealized_pnl ?? 0
  const investedValue = position.invested_value_usd ?? 0

  // Extrair símbolo base (remover sufixos de quote currency)
  // Regex que remove apenas sufixos conhecidos do final ($ = final da string)
  const baseSymbol = position.symbol.replace(/(USDT|BUSD|USDC|TUSD|FDUSD|USD|BTC|ETH|BNB|EUR|GBP)$/i, '')
  
  // Debug: log se houver discrepância (temporário)
  if (position.symbol.includes('BNB') && baseSymbol !== 'BNB' && !position.symbol.startsWith('BNB')) {
    console.log('Símbolo original:', position.symbol, '-> Base extraído:', baseSymbol)
  }

  const colorGradient = getHeatmapColor(pnlPct)
  const textColor = getTextColor(pnlPct)

  return (
    <div
      className="heatmap-card-container"
      style={{ perspective: '1000px' }}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className={cn(
          'heatmap-card relative w-full h-full transition-transform duration-600 cursor-pointer',
          isFlipped && 'rotate-y-180'
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Frente do Card */}
        <div
          className={cn(
            'absolute inset-0 rounded-lg p-3 flex flex-col items-center justify-center gap-2',
            'bg-gradient-to-br border border-white/10 shadow-lg',
            'backface-hidden',
            colorGradient
          )}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Logo da Cripto */}
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={baseSymbol}
                className="w-9 h-9 rounded-full"
                onError={(e) => {
                  // Fallback para ícone genérico se a imagem falhar
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <Coins className={cn('h-6 w-6', textColor, logoUrl ? 'hidden' : '')} />
          </div>

          {/* Símbolo */}
          <div className="text-center">
            <h3 className={cn('text-base font-bold font-mono', textColor)}>
              {baseSymbol}
            </h3>
          </div>

          {/* Badge de PNL% */}
          <div>
            <div
              className={cn(
                'px-3 py-1 rounded-full font-bold text-lg',
                'bg-black/30 backdrop-blur-sm',
                textColor
              )}
            >
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </div>
          </div>

          {/* Indicador de click */}
          <div className="absolute bottom-1 right-2 text-white/50 text-[10px]">
            Clique
          </div>
        </div>

        {/* Verso do Card */}
        <div
          className={cn(
            'absolute inset-0 rounded-lg p-2 flex flex-col items-center justify-center gap-2',
            'bg-gradient-to-br border border-white/10 shadow-lg',
            'backface-hidden',
            colorGradient
          )}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Símbolo no topo */}
          <div className="text-center">
            <h3 className={cn('text-sm font-bold font-mono', textColor)}>
              {baseSymbol}
            </h3>
          </div>

          {/* Valores em USD */}
          <div className="w-full space-y-1.5">
            {/* Valor Comprado */}
            <div className="bg-black/30 backdrop-blur-sm rounded p-1.5">
              <p className="text-[9px] text-white/70 mb-0.5">Comprado</p>
              <p className={cn('text-xs font-bold font-mono', textColor)}>
                {formatCurrency(investedValue)}
              </p>
            </div>

            {/* PNL Não Realizado */}
            <div className="bg-black/30 backdrop-blur-sm rounded p-1.5">
              <p className="text-[9px] text-white/70 mb-0.5">PNL</p>
              <p className={cn('text-xs font-bold font-mono', textColor)}>
                {unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(unrealizedPnl)}
              </p>
            </div>

            {/* Quantidade */}
            <div className="bg-black/30 backdrop-blur-sm rounded p-1.5">
              <p className="text-[9px] text-white/70 mb-0.5">Qtd</p>
              <p className={cn('text-[10px] font-mono', textColor)}>
                {Number(position.qty_remaining || 0).toFixed(4)}
              </p>
            </div>
          </div>

          {/* Indicador de click */}
          <div className="absolute bottom-1 right-2 text-white/50 text-[9px]">
            Clique
          </div>
        </div>
      </div>
    </div>
  )
}

