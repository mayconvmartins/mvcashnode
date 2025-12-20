'use client'

import { CleanupOrphanedPositions } from '@/components/monitoring/CleanupOrphanedPositions'
import { SyncExecutionFees } from '@/components/monitoring/SyncExecutionFees'
import { AuditPositions } from '@/components/monitoring/AuditPositions'
import { DustPositions } from '@/components/monitoring/DustPositions'
import { SuspiciousSellExecutions } from '@/components/monitoring/SuspiciousSellExecutions'
import { AuditFifoPositions } from '@/components/monitoring/AuditFifoPositions'
import { CancelAllPendingOrders } from '@/components/monitoring/CancelAllPendingOrders'
import { EnqueueOrphanOrders } from '@/components/monitoring/EnqueueOrphanOrders'
import { OrphanedExecutions } from '@/components/monitoring/OrphanedExecutions'
import { MissingOrders } from '@/components/monitoring/MissingOrders'
import { MigrateToSubscriber } from '@/components/monitoring/MigrateToSubscriber'
import { ClosePositionsBreakeven } from '@/components/monitoring/ClosePositionsBreakeven'
import { Wrench } from 'lucide-react'

export default function DebugToolsPage() {
    return (
        <div className="container mx-auto py-4 space-y-4">
            <div className="flex items-center gap-3 mb-4">
                <Wrench className="h-6 w-6 text-primary" />
                <div>
                    <h1 className="text-2xl font-bold">Debug Tools</h1>
                    <p className="text-sm text-muted-foreground">
                        Ferramentas de diagnóstico e correção para administradores
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Migrar Usuário para Assinante */}
                <MigrateToSubscriber />

                {/* Fechar Posições sem Lucro/Perda */}
                <ClosePositionsBreakeven />

                {/* Executions Órfãs */}
                <OrphanedExecutions />

                {/* Ordens Faltantes da Exchange */}
                <MissingOrders />

                {/* Limpeza de Posições Órfãs */}
                <CleanupOrphanedPositions />

                {/* Sincronização de Taxas */}
                <SyncExecutionFees />

                {/* Execuções Suspeitas */}
                <SuspiciousSellExecutions />

                {/* Enfileirar Ordens Órfãs */}
                <EnqueueOrphanOrders />

                {/* Cancelar Ordens Pendentes */}
                <CancelAllPendingOrders />
            </div>

            {/* Auditoria Completa de Posições - Largura Total */}
            <AuditPositions />

            <div className="grid gap-4 md:grid-cols-2">
                {/* Gerenciamento de Resíduos */}
                <DustPositions />
            </div>

            <div className="grid gap-4 md:grid-cols-1">
                {/* Auditoria FIFO de Posições */}
                <AuditFifoPositions />
            </div>
        </div>
    )
}

