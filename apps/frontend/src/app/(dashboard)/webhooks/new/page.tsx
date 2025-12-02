'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { WebhookForm } from '@/components/webhooks/WebhookForm'

export default function NewWebhookPage() {
    const router = useRouter()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/webhooks')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">Novo Webhook</h1>
                    <p className="text-muted-foreground">Configure um novo webhook source</p>
                </div>
            </div>

            {/* Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Informações do Webhook</CardTitle>
                    <CardDescription>
                        Preencha os dados abaixo para criar um novo webhook
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <WebhookForm 
                        onSuccess={(webhook) => {
                            router.push(`/webhooks/${webhook.id}`)
                        }}
                        onCancel={() => router.push('/webhooks')}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

