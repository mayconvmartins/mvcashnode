'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, Filter, RefreshCw, ChevronDown, Zap, ZapOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { HeatmapCard } from '@/components/positions/HeatmapCard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { positionsService } from '@/lib/api/positions.service'
import { accountsService } from '@/lib/api/accounts.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { getCryptoLogos } from '@/lib/utils/crypto-logos'
import type { Position } from '@/lib/types'
import { cn } from '@/lib/utils'

type SortOption = 'pnl_desc' | 'pnl_asc' | 'symbol' | 'value_desc' | 'value_asc'

export default function HeatmapPage() {
  const { tradeMode } = useTradeMode()
  const [selectedAccount, setSelectedAccount] = useState<string>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('pnl_desc')
  const [logoMap, setLogoMap] = useState<Map<string, string | null>>(new Map())
  const [logosLoading, setLogosLoading] = useState(true)
  const [realtimeEnabled, setRealtimeEnabled] = useState(false)
  const [nextUpdate, setNextUpdate] = useState<number>(60)

  // Buscar contas
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: accountsService.list,
  })

  // Construir filtros para posições abertas
  const filters = useMemo(() => {
    const f: any = {
      status: 'OPEN',
      trade_mode: tradeMode,
      limit: 1000,
      is_dust: false, // Excluir resíduos do mapa de calor
    }
    if (selectedAccount !== 'all') {
      f.exchange_account_id = parseInt(selectedAccount)
    }
    return f
  }, [tradeMode, selectedAccount])

  // Buscar posições abertas
  const { data: positionsData, isLoading: loadingPositions, refetch } = useQuery({
    queryKey: ['positions', 'heatmap', filters],
    queryFn: () => positionsService.list(filters),
    refetchInterval: realtimeEnabled ? 60000 : false, // Atualizar a cada 60 segundos apenas se realtime ativo
    staleTime: 30000,
  })

  const positions = Array.isArray(positionsData) 
    ? positionsData 
    : (positionsData as any)?.data || []

  // Contador para próxima atualização (quando realtime ativo)
  useEffect(() => {
    if (!realtimeEnabled) {
      setNextUpdate(60)
      return
    }

    // Resetar contador quando refetch acontecer
    setNextUpdate(60)
    
    const interval = setInterval(() => {
      setNextUpdate((prev) => {
        if (prev <= 1) {
          return 60 // Resetar após refetch
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [realtimeEnabled, positionsData]) // Adicionar positionsData para resetar ao atualizar

  // Buscar logos quando as posições mudarem
  useEffect(() => {
    if (!positions || positions.length === 0) {
      setLogosLoading(false)
      return
    }

    const fetchLogos = async () => {
      setLogosLoading(true)
      try {
        const symbols = positions.map((p: Position) => p.symbol)
        const logos = await getCryptoLogos(symbols)
        setLogoMap(logos)
      } catch (error) {
        console.error('Erro ao buscar logos:', error)
      } finally {
        setLogosLoading(false)
      }
    }

    fetchLogos()
  }, [positions])

  // Ordenar posições
  const sortedPositions = useMemo(() => {
    if (!positions) return []
    
    const sorted = [...positions]
    
    switch (sortBy) {
      case 'pnl_desc':
        return sorted.sort((a, b) => (b.unrealized_pnl_pct || 0) - (a.unrealized_pnl_pct || 0))
      case 'pnl_asc':
        return sorted.sort((a, b) => (a.unrealized_pnl_pct || 0) - (b.unrealized_pnl_pct || 0))
      case 'symbol':
        return sorted.sort((a, b) => a.symbol.localeCompare(b.symbol))
      case 'value_desc':
        return sorted.sort((a, b) => (b.invested_value_usd || 0) - (a.invested_value_usd || 0))
      case 'value_asc':
        return sorted.sort((a, b) => (a.invested_value_usd || 0) - (b.invested_value_usd || 0))
      default:
        return sorted
    }
  }, [positions, sortBy])

  const hasActiveFilters = selectedAccount !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Flame className="h-8 w-8 text-orange-500" />
            <h1 className="text-3xl font-bold gradient-text">Mapa de Calor</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Visualize suas posições abertas em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={realtimeEnabled ? 'default' : 'outline'}
            onClick={() => setRealtimeEnabled(!realtimeEnabled)}
            className={cn(
              realtimeEnabled && 'bg-green-600 hover:bg-green-700'
            )}
          >
            {realtimeEnabled ? (
              <>
                <Zap className="h-4 w-4 mr-2 animate-pulse" />
                Realtime ON
                <Badge variant="secondary" className="ml-2 bg-black/20">
                  {nextUpdate}s
                </Badge>
              </>
            ) : (
              <>
                <ZapOff className="h-4 w-4 mr-2" />
                Realtime OFF
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={loadingPositions}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingPositions ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <ModeToggle />
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total de Posições</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPositions ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{positions.length}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>PNL Médio</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPositions ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                {positions.length > 0
                  ? (
                      positions.reduce((acc: number, p: Position) => acc + (p.unrealized_pnl_pct || 0), 0) /
                      positions.length
                    ).toFixed(2)
                  : '0.00'}
                %
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Em Alta</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPositions ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-green-500">
                  {positions.filter((p: Position) => (p.unrealized_pnl_pct || 0) > 0).length}
                </div>
                <div className="text-sm text-muted-foreground">
                  / {positions.filter((p: Position) => (p.unrealized_pnl_pct || 0) < 0).length} em baixa
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtros Colapsáveis */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-lg">Filtros e Ordenação</CardTitle>
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2">
                      Ativos
                    </Badge>
                  )}
                </div>
                <ChevronDown 
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    filtersOpen && "transform rotate-180"
                  )}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Filtro de Conta */}
                <div className="space-y-2">
                  <Label htmlFor="account-filter">Conta</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger id="account-filter">
                      <SelectValue placeholder="Todas as contas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as contas</SelectItem>
                      {accounts?.filter(acc => {
                        const accTradeMode = acc.is_simulation ? 'SIMULATION' : 'REAL'
                        return accTradeMode === tradeMode
                      }).map(account => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          {account.label} ({account.exchange})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Ordenação */}
                <div className="space-y-2">
                  <Label htmlFor="sort-filter">Ordenar por</Label>
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                    <SelectTrigger id="sort-filter">
                      <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pnl_desc">PNL% (maior primeiro)</SelectItem>
                      <SelectItem value="pnl_asc">PNL% (menor primeiro)</SelectItem>
                      <SelectItem value="value_desc">Valor investido (maior)</SelectItem>
                      <SelectItem value="value_asc">Valor investido (menor)</SelectItem>
                      <SelectItem value="symbol">Símbolo (A-Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Grid de Cards */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Posições Abertas - {tradeMode}
            {selectedAccount !== 'all' && accounts && (
              <span className="text-sm font-normal text-muted-foreground">
                • {accounts.find(a => a.id.toString() === selectedAccount)?.label}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPositions || logosLoading ? (
            // Loading state
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square">
                  <Skeleton className="w-full h-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : sortedPositions.length === 0 ? (
            // Empty state
            <div className="text-center py-12">
              <Flame className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? 'Nenhuma posição aberta encontrada com os filtros aplicados'
                  : 'Nenhuma posição aberta no momento'}
              </p>
            </div>
          ) : (
            // Grid de cards
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 animate-fade-in">
              {sortedPositions.map((position: Position) => (
                <HeatmapCard
                  key={position.id}
                  position={position}
                  logoUrl={logoMap.get(position.symbol) || null}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda de Cores */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-sm">Legenda de Cores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-red-900/90 to-red-800/80 border border-white/10" />
              <span className="text-muted-foreground">&lt; -5%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-red-700/90 to-red-600/80 border border-white/10" />
              <span className="text-muted-foreground">-5% a -2%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-yellow-500/90 to-yellow-400/80 border border-white/10" />
              <span className="text-muted-foreground">-2% a 0%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-green-500/90 to-green-600/80 border border-white/10" />
              <span className="text-muted-foreground">0% a 2%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-green-600/90 to-green-700/80 border border-white/10" />
              <span className="text-muted-foreground">2% a 5%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-green-700/90 to-green-800/90 border border-white/10" />
              <span className="text-muted-foreground">5% a 10%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-green-800/90 to-green-900/90 border border-white/10" />
              <span className="text-muted-foreground">&gt; 10%</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            💡 Clique em qualquer card para ver detalhes da posição
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

