'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { ParameterWizard } from '@/components/parameters/ParameterWizard'

export default function NewParameterPage() {
    const router = useRouter()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/parameters')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">Novo Parâmetro de Trade</h1>
                    <p className="text-muted-foreground">Configure um novo parâmetro de trading</p>
                </div>
            </div>

            {/* Wizard */}
            <Card>
                <CardHeader>
                    <CardTitle>Assistente de Configuração</CardTitle>
                    <CardDescription>
                        Siga os passos abaixo para configurar seu parâmetro
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ParameterWizard 
                        onSuccess={(parameter) => {
                            router.push('/parameters')
                        }}
                        onCancel={() => router.push('/parameters')}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

