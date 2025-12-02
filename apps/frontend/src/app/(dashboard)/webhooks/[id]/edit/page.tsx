'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, XCircle } from 'lucide-react'
import { WebhookForm } from '@/components/webhooks/WebhookForm'
import { webhooksService } from '@/lib/api/webhooks.service'

export default function EditWebhookPage() {
    const params = useParams()
    const router = useRouter()
    const webhookId = parseInt(params.id as string)

    const { data: webhook, isLoading } = useQuery({
        queryKey: ['webhook', webhookId],
        queryFn: () => webhooksService.getSource(webhookId),
        enabled: !isNaN(webhookId),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!webhook) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <XCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-2xl font-bold mb-2">Webhook não encontrado</h2>
                <Button onClick={() => router.push('/webhooks')} variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar para Webhooks
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push(`/webhooks/${webhookId}`)}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">Editar Webhook</h1>
                    <p className="text-muted-foreground">Atualize as configurações do webhook</p>
                </div>
            </div>

            {/* Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Informações do Webhook</CardTitle>
                    <CardDescription>
                        Atualize os dados abaixo para modificar o webhook
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <WebhookForm 
                        webhook={webhook}
                        onSuccess={(updatedWebhook) => {
                            router.push(`/webhooks/${updatedWebhook.id}`)
                        }}
                        onCancel={() => router.push(`/webhooks/${webhookId}`)}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

