'use client'

import { CleanupOrphanedPositions } from '@/components/monitoring/CleanupOrphanedPositions'
import { SyncExecutionFees } from '@/components/monitoring/SyncExecutionFees'
import { AuditPositions } from '@/components/monitoring/AuditPositions'
import { DustPositions } from '@/components/monitoring/DustPositions'
import { Wrench } from 'lucide-react'

export default function DebugToolsPage() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <Wrench className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold">Debug Tools</h1>
                    <p className="text-muted-foreground">
                        Ferramentas de diagnóstico e correção para administradores
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Limpeza de Posições Órfãs */}
                <CleanupOrphanedPositions />

                {/* Sincronização de Taxas */}
                <SyncExecutionFees />
            </div>

            {/* Auditoria Completa de Posições */}
            <AuditPositions />

            {/* Gerenciamento de Resíduos */}
            <DustPositions />
        </div>
    )
}

