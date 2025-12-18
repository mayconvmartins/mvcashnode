'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Users, CreditCard, Check, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { adminService } from '@/lib/api/admin.service'
import { toast } from 'sonner'

export function MigrateToSubscriber() {
    const queryClient = useQueryClient()
    const [selectedUserId, setSelectedUserId] = useState<string>('')
    const [selectedPlanId, setSelectedPlanId] = useState<string>('')
    const [durationMonths, setDurationMonths] = useState<string>('1')
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [result, setResult] = useState<any>(null)

    // Buscar usuários disponíveis para migração
    const { data: usersData, isLoading: loadingUsers } = useQuery({
        queryKey: ['admin', 'users-for-migration'],
        queryFn: adminService.getUsersForMigration,
    })

    // Buscar planos de assinatura
    const { data: plansData, isLoading: loadingPlans } = useQuery({
        queryKey: ['admin', 'subscription-plans-migration'],
        queryFn: adminService.getSubscriptionPlansForMigration,
    })

    const users = usersData?.data || []
    const plans = plansData?.data || []

    const selectedUser = users.find(u => u.id.toString() === selectedUserId)
    const selectedPlan = plans.find(p => p.id.toString() === selectedPlanId)

    // Mutation para migrar
    const migrateMutation = useMutation({
        mutationFn: adminService.migrateUserToSubscriber,
        onSuccess: (data) => {
            setResult(data)
            setConfirmOpen(false)
            queryClient.invalidateQueries({ queryKey: ['admin', 'users-for-migration'] })
            queryClient.invalidateQueries({ queryKey: ['admin', 'subscribers'] })
            toast.success(data.message)
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao migrar usuário')
            setConfirmOpen(false)
        },
    })

    const handleMigrate = () => {
        if (!selectedUserId || !selectedPlanId) {
            toast.error('Selecione um usuário e um plano')
            return
        }
        setConfirmOpen(true)
    }

    const confirmMigration = () => {
        migrateMutation.mutate({
            user_id: parseInt(selectedUserId),
            plan_id: parseInt(selectedPlanId),
            duration_months: parseInt(durationMonths)
        })
    }

    const resetForm = () => {
        setSelectedUserId('')
        setSelectedPlanId('')
        setDurationMonths('1')
        setResult(null)
    }

    return (
        <Card className="col-span-1">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-blue-500" />
                    Migrar para Assinante
                </CardTitle>
                <CardDescription>
                    Converter um usuário normal em assinante
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Resultado da migração */}
                {result && (
                    <Alert className="bg-green-500/10 border-green-500">
                        <Check className="h-4 w-4 text-green-500" />
                        <AlertDescription>
                            <div className="space-y-2">
                                <p className="font-medium text-green-500">{result.message}</p>
                                <div className="text-sm space-y-1">
                                    {result.actions.map((action: string, i: number) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <Check className="h-3 w-3" />
                                            <span>{action}</span>
                                        </div>
                                    ))}
                                </div>
                                <Button variant="outline" size="sm" onClick={resetForm} className="mt-2">
                                    Nova Migração
                                </Button>
                            </div>
                        </AlertDescription>
                    </Alert>
                )}

                {!result && (
                    <>
                        {/* Seleção de Usuário */}
                        <div className="space-y-2">
                            <Label>Usuário</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={loadingUsers ? "Carregando..." : "Selecione um usuário"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map((user) => (
                                        <SelectItem key={user.id} value={user.id.toString()}>
                                            <div className="flex items-center gap-2">
                                                <span>{user.email}</span>
                                                {user.full_name && (
                                                    <span className="text-muted-foreground">({user.full_name})</span>
                                                )}
                                                <Badge variant="outline" className="text-xs">
                                                    {user.accounts_count} conta(s)
                                                </Badge>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {users.length === 0 && !loadingUsers && (
                                <p className="text-xs text-muted-foreground">
                                    Nenhum usuário disponível para migração
                                </p>
                            )}
                        </div>

                        {/* Seleção de Plano */}
                        <div className="space-y-2">
                            <Label>Plano de Assinatura</Label>
                            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={loadingPlans ? "Carregando..." : "Selecione um plano"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {plans.map((plan) => (
                                        <SelectItem key={plan.id} value={plan.id.toString()}>
                                            <div className="flex items-center gap-2">
                                                <span>{plan.name}</span>
                                                <span className="text-muted-foreground">
                                                    R$ {plan.price_monthly.toFixed(2)}/mês
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Duração */}
                        <div className="space-y-2">
                            <Label>Duração</Label>
                            <Select value={durationMonths} onValueChange={setDurationMonths}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 mês</SelectItem>
                                    <SelectItem value="3">3 meses</SelectItem>
                                    <SelectItem value="6">6 meses</SelectItem>
                                    <SelectItem value="12">12 meses</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Preview */}
                        {selectedUser && selectedPlan && (
                            <>
                                <Separator />
                                <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                                    <p className="text-sm font-medium">Preview da Migração:</p>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>• Usuário: <strong>{selectedUser.email}</strong></li>
                                        <li>• Plano: <strong>{selectedPlan.name}</strong></li>
                                        <li>• Duração: <strong>{durationMonths} mês(es)</strong></li>
                                        <li>• Contas a vincular: <strong>{selectedUser.accounts_count}</strong></li>
                                    </ul>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Ações que serão executadas:
                                    </p>
                                    <ul className="text-xs text-muted-foreground space-y-1">
                                        <li>✓ Adicionar role "subscriber"</li>
                                        <li>✓ Criar/atualizar subscription</li>
                                        <li>✓ Criar parâmetros de assinante</li>
                                        <li>✓ Vincular webhooks padrão</li>
                                    </ul>
                                </div>
                            </>
                        )}

                        {/* Botão Migrar */}
                        <Button 
                            onClick={handleMigrate} 
                            disabled={!selectedUserId || !selectedPlanId || migrateMutation.isPending}
                            className="w-full"
                        >
                            {migrateMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Migrando...
                                </>
                            ) : (
                                <>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Migrar para Assinante
                                </>
                            )}
                        </Button>
                    </>
                )}

                {/* Dialog de Confirmação */}
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Confirmar Migração</DialogTitle>
                            <DialogDescription>
                                Você está prestes a migrar o usuário para assinante. Esta ação irá:
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                    <ul className="space-y-1 text-sm">
                                        <li>• Adicionar role "subscriber" ao usuário</li>
                                        <li>• Criar subscription com plano <strong>{selectedPlan?.name}</strong></li>
                                        <li>• Configurar parâmetros padrão de assinante</li>
                                        <li>• Vincular webhooks padrão às contas</li>
                                    </ul>
                                </AlertDescription>
                            </Alert>
                            <p className="text-sm text-muted-foreground">
                                Usuário: <strong>{selectedUser?.email}</strong>
                            </p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={confirmMigration} disabled={migrateMutation.isPending}>
                                {migrateMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Migrando...
                                    </>
                                ) : (
                                    'Confirmar Migração'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    )
}

