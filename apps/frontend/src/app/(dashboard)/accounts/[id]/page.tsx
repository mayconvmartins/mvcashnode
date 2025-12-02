'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsService } from '@/lib/api/accounts.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
    ArrowLeft, 
    RefreshCw, 
    CheckCircle2, 
    XCircle, 
    Wallet, 
    TrendingUp, 
    Settings,
    Activity,
    Clock,
    Shield,
    AlertCircle,
    PiggyBank
} from 'lucide-react'
import { formatDateTime, formatCurrency, formatAssetAmount } from '@/lib/utils/format'
import { toast } from 'sonner'
import { TestConnectionButton } from '@/components/accounts/TestConnectionButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function AccountDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const accountId = Number(params.id)

    const { data: account, isLoading, error } = useQuery({
        queryKey: ['account', accountId],
        queryFn: () => accountsService.getOne(accountId),
        enabled: !isNaN(accountId),
    })

    const syncBalancesMutation = useMutation({
        mutationFn: () => accountsService.syncBalances(accountId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['account', accountId] })
            toast.success('Saldos sincronizados com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao sincronizar saldos')
        },
    })

    const syncPositionsMutation = useMutation({
        mutationFn: () => accountsService.syncPositions(accountId),
        onSuccess: () => {
            toast.success('Posições sincronizadas com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao sincronizar posições')
        },
    })

    const { data: balances, isLoading: isLoadingBalances, error: balancesError, refetch: refetchBalances } = useQuery({
        queryKey: ['accountBalances', accountId],
        queryFn: () => accountsService.getBalances(accountId),
        enabled: !isNaN(accountId),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div>
                        <Skeleton className="h-8 w-64 mb-2" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-[120px]" />
                    ))}
                </div>
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (error || !account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <XCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Conta não encontrada</h2>
                <p className="text-muted-foreground mb-4">
                    A conta #{accountId} não existe ou você não tem permissão para acessá-la.
                </p>
                <Button onClick={() => router.push('/accounts')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Contas
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/accounts')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">{account.label}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">{account.exchange}</Badge>
                            {account.is_testnet && (
                                <Badge variant="warning">TESTNET</Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <TestConnectionButton accountId={accountId} />
                    <Badge 
                        variant={account.is_active ? 'success' : 'secondary'}
                        className="text-sm px-3 py-1"
                    >
                        {account.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <Badge 
                        variant={account.trade_mode === 'REAL' ? 'destructive' : 'secondary'}
                        className="text-sm px-3 py-1"
                    >
                        {account.trade_mode}
                    </Badge>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => syncBalancesMutation.mutate()}
                    disabled={syncBalancesMutation.isPending}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncBalancesMutation.isPending ? 'animate-spin' : ''}`} />
                    Sincronizar Saldos
                </Button>
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => syncPositionsMutation.mutate()}
                    disabled={syncPositionsMutation.isPending}
                >
                    <TrendingUp className={`h-4 w-4 mr-2 ${syncPositionsMutation.isPending ? 'animate-spin' : ''}`} />
                    Sincronizar Posições
                </Button>
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => router.push(`/positions?account=${accountId}`)}
                >
                    <Activity className="h-4 w-4 mr-2" />
                    Ver Posições
                </Button>
                <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => router.push(`/parameters?account=${accountId}`)}
                >
                    <Settings className="h-4 w-4 mr-2" />
                    Ver Parâmetros
                </Button>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                    <TabsTrigger value="balances">💰 Saldos</TabsTrigger>
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="security">Segurança</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    {/* Stats Cards */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card className="glass">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2">
                                    <Wallet className="h-4 w-4" />
                                    Modo de Trading
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{account.trade_mode}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {account.trade_mode === 'REAL' ? 'Operações reais' : 'Modo simulação'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="glass">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2">
                                    <Activity className="h-4 w-4" />
                                    Exchange
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{account.exchange}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {account.is_testnet ? 'Ambiente de teste' : 'Ambiente de produção'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="glass">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Status
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${account.is_active ? 'text-green-500' : 'text-muted-foreground'}`}>
                                    {account.is_active ? 'Ativa' : 'Inativa'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {account.is_active ? 'Pronta para operar' : 'Conta desativada'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="glass">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Criada em
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    {formatDateTime(account.created_at)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Data de cadastro
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Info Card */}
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Informações da Conta</CardTitle>
                            <CardDescription>
                                Dados principais da conta de exchange
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-3">
                                    <div className="flex justify-between py-2 border-b">
                                        <span className="text-muted-foreground">ID:</span>
                                        <span className="font-mono font-medium">{account.id}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b">
                                        <span className="text-muted-foreground">Nome:</span>
                                        <span className="font-medium">{account.label}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b">
                                        <span className="text-muted-foreground">Exchange:</span>
                                        <span className="font-medium">{account.exchange}</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between py-2 border-b">
                                        <span className="text-muted-foreground">Modo:</span>
                                        <Badge variant={account.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                                            {account.trade_mode}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between py-2 border-b">
                                        <span className="text-muted-foreground">Testnet:</span>
                                        <span className="font-medium">{account.is_testnet ? 'Sim' : 'Não'}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b">
                                        <span className="text-muted-foreground">Atualizado em:</span>
                                        <span className="font-medium">{formatDateTime(account.updated_at)}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="balances" className="space-y-4">
                    <Card className="glass">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Saldos da Conta</CardTitle>
                                    <CardDescription>
                                        Visualize todos os ativos disponíveis nesta conta
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        syncBalancesMutation.mutate(undefined, {
                                            onSuccess: () => {
                                                refetchBalances()
                                            }
                                        })
                                    }}
                                    disabled={syncBalancesMutation.isPending}
                                >
                                    <RefreshCw className={`h-4 w-4 mr-2 ${syncBalancesMutation.isPending ? 'animate-spin' : ''}`} />
                                    Sincronizar
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {syncBalancesMutation.isError && (
                                <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 mb-4">
                                    <p className="text-sm text-destructive">
                                        <AlertCircle className="h-4 w-4 inline mr-2" />
                                        {(syncBalancesMutation.error as any)?.response?.data?.message || 'Erro ao sincronizar saldos'}
                                    </p>
                                </div>
                            )}
                            
                            {syncBalancesMutation.isSuccess && (
                                <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 mb-4">
                                    <p className="text-sm text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="h-4 w-4 inline mr-2" />
                                        Saldos sincronizados com sucesso!
                                    </p>
                                </div>
                            )}

                            {isLoadingBalances ? (
                                <div className="text-center py-8">
                                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                    <p className="text-muted-foreground mt-4">Carregando saldos...</p>
                                </div>
                            ) : balancesError ? (
                                <div className="text-center py-8 text-destructive">
                                    <XCircle className="h-8 w-8 mx-auto mb-4" />
                                    <p>Erro ao carregar saldos: {(balancesError as any)?.response?.data?.message || 'Erro desconhecido'}</p>
                                    <Button onClick={() => refetchBalances()} className="mt-4">
                                        Tentar Novamente
                                    </Button>
                                </div>
                            ) : balances && balances.balances && Object.keys(balances.balances).length > 0 ? (
                                <div className="space-y-4">
                                    {balances.lastSync && (
                                        <div className="text-sm text-muted-foreground">
                                            Última sincronização: {formatDateTime(balances.lastSync)}
                                        </div>
                                    )}
                                    
                                    {/* Card de Valor Total em USDT */}
                                    {(() => {
                                        // Buscar USDT disponível (pode ser USDT ou USDT.P)
                                        const usdtBalance = balances.balances['USDT'] || balances.balances['USDT.P'] || { free: 0, locked: 0 }
                                        const totalUsdtAvailable = usdtBalance.free
                                        
                                        // Calcular total de todos os ativos (quantidade)
                                        const totalAssets = Object.entries(balances.balances)
                                            .filter(([_, balance]) => {
                                                const total = balance.free + balance.locked
                                                return total > 0.00000001
                                            })
                                            .length
                                        
                                        return (
                                            <Card className="glass border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-background shadow-lg">
                                                <CardContent className="pt-6 pb-6">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                                                                Saldo Disponível em USDT
                                                            </p>
                                                            <p className="text-5xl font-bold gradient-text mb-2">
                                                                {formatCurrency(totalUsdtAvailable, 'USD')}
                                                            </p>
                                                            <div className="flex items-center gap-4 mt-3">
                                                                <div className="text-xs text-muted-foreground">
                                                                    <span className="font-medium">{totalAssets}</span> ativo{totalAssets !== 1 ? 's' : ''} com saldo
                                                                </div>
                                                                {totalUsdtAvailable === 0 && (
                                                                    <div className="text-xs text-amber-600 dark:text-amber-400">
                                                                        Nenhum USDT disponível
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border-2 border-primary/30">
                                                            <Wallet className="h-10 w-10 text-primary" />
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )
                                    })()}
                                    
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Ativo</TableHead>
                                                <TableHead className="text-right">Disponível</TableHead>
                                                <TableHead className="text-right">Bloqueado</TableHead>
                                                <TableHead className="text-right">Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Object.entries(balances.balances)
                                                .filter(([_, balance]) => {
                                                    const total = balance.free + balance.locked
                                                    return total > 0.00000001 // Filtrar apenas valores > 0
                                                })
                                                .sort(([assetA, balanceA], [assetB, balanceB]) => {
                                                    // Ordenar por quantidade total (maior primeiro)
                                                    const totalA = balanceA.free + balanceA.locked
                                                    const totalB = balanceB.free + balanceB.locked
                                                    return totalB - totalA
                                                })
                                                .map(([asset, balance]) => {
                                                    const totalAmount = balance.free + balance.locked
                                                    return (
                                                        <TableRow key={asset}>
                                                            <TableCell className="font-medium">{asset}</TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="font-mono text-sm">{formatAssetAmount(balance.free)}</div>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="font-mono text-sm">{formatAssetAmount(balance.locked)}</div>
                                                            </TableCell>
                                                            <TableCell className="text-right font-semibold">
                                                                <div className="font-mono">{formatAssetAmount(totalAmount)}</div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                        </TableBody>
                                    </Table>
                                    {Object.entries(balances.balances).filter(([_, balance]) => {
                                        const total = balance.free + balance.locked
                                        return total > 0.00000001
                                    }).length === 0 && (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <PiggyBank className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                            <p>Nenhum saldo disponível para exibir.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <PiggyBank className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p className="mb-2">Nenhum saldo encontrado para esta conta.</p>
                                    <Button 
                                        variant="outline"
                                        onClick={() => {
                                            syncBalancesMutation.mutate(undefined, {
                                                onSuccess: () => {
                                                    refetchBalances()
                                                }
                                            })
                                        }}
                                        disabled={syncBalancesMutation.isPending}
                                    >
                                        <RefreshCw className={`h-4 w-4 mr-2 ${syncBalancesMutation.isPending ? 'animate-spin' : ''}`} />
                                        {syncBalancesMutation.isPending ? 'Sincronizando...' : 'Sincronizar Agora'}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="details" className="space-y-4">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Configurações da API</CardTitle>
                            <CardDescription>
                                Informações sobre a conexão com a exchange
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">API Key (parcial):</span>
                                <span className="font-mono">
                                    {account.api_key ? `${account.api_key.substring(0, 8)}...${account.api_key.slice(-4)}` : 'N/A'}
                                </span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Secret Key:</span>
                                <span className="font-mono">••••••••••••••••</span>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-4 mt-4">
                                <p className="text-sm text-muted-foreground">
                                    <Shield className="h-4 w-4 inline mr-2" />
                                    As credenciais são armazenadas de forma segura e criptografada.
                                    Nunca compartilhe sua API Key ou Secret Key com terceiros.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Parâmetros Vinculados</CardTitle>
                            <CardDescription>
                                Parâmetros de trading que utilizam esta conta
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-muted-foreground">
                                <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>Para ver os parâmetros vinculados, acesse a página de parâmetros.</p>
                                <Button 
                                    variant="outline" 
                                    className="mt-4"
                                    onClick={() => router.push(`/parameters?account=${accountId}`)}
                                >
                                    Ver Parâmetros
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-4">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Segurança da Conta</CardTitle>
                            <CardDescription>
                                Informações de segurança e boas práticas
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
                                <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-2">
                                    Recomendações de Segurança
                                </h4>
                                <ul className="text-sm space-y-2 text-muted-foreground">
                                    <li>• Utilize API Keys com permissões mínimas necessárias</li>
                                    <li>• Habilite restrição de IP na exchange quando possível</li>
                                    <li>• Nunca compartilhe suas credenciais</li>
                                    <li>• Revogue e recrie as chaves periodicamente</li>
                                    <li>• Monitore atividades suspeitas regularmente</li>
                                </ul>
                            </div>

                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Permissões da API:</span>
                                <span className="font-medium">Leitura + Trading</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Restrição de IP:</span>
                                <span className="font-medium">Não configurado</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Última verificação:</span>
                                <span className="font-medium">-</span>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

