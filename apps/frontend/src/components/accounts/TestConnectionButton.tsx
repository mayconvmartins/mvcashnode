'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { accountsService } from '@/lib/api/accounts.service'
import { toast } from 'sonner'

interface TestConnectionButtonProps {
    accountId: number
}

export function TestConnectionButton({ accountId }: TestConnectionButtonProps) {
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

    const testMutation = useMutation({
        mutationFn: () => accountsService.testConnection(accountId),
        onSuccess: (response) => {
            // O interceptor do Axios já extraiu o data, então response já é { success, message }
            if (response.success) {
                setTestResult('success')
                toast.success(response.message || 'Conexão testada com sucesso!')
                setTimeout(() => setTestResult(null), 3000)
            } else {
                setTestResult('error')
                toast.error(response.message || 'Falha na conexão')
                setTimeout(() => setTestResult(null), 3000)
            }
        },
        onError: (error: any) => {
            setTestResult('error')
            toast.error(error.response?.data?.message || 'Falha ao testar conexão')
            setTimeout(() => setTestResult(null), 3000)
        },
    })

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="relative"
        >
            {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : testResult === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
            ) : testResult === 'error' ? (
                <XCircle className="h-4 w-4 text-destructive" />
            ) : (
                <span className="text-xs">Testar</span>
            )}
        </Button>
    )
}

