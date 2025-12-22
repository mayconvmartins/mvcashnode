'use client'

import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Download } from 'lucide-react'
import { useState } from 'react'

export default function CcxtLogsPage() {
    const [lines, setLines] = useState(300)

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['ccxt-logs', lines],
        queryFn: () => adminService.getCcxtLogs(lines),
        refetchInterval: 10000, // auto refresh a cada 10s
    })

    const entries = data?.entries || []

    const handleDownload = () => {
        const blob = new Blob([entries.map((e: any) => JSON.stringify(e)).join('\n')], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'ccxt-log.jsonl'
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Logs CCXT</h1>
                    <p className="text-muted-foreground">Requisições/Respostas sanitizadas da exchange</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline">{lines} linhas</Badge>
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownload} disabled={!entries.length}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Últimos eventos</CardTitle>
                    <CardDescription>Atualiza automaticamente a cada 10s</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-sm text-muted-foreground">Carregando...</div>
                    ) : entries.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Nenhum log encontrado.</div>
                    ) : (
                        <div className="h-[70vh] overflow-auto border rounded-md bg-muted/30 p-3 space-y-2 text-xs font-mono">
                            {entries.map((entry: any, idx: number) => (
                                <div key={idx} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                        <span>{entry.ts}</span>
                                        <Badge variant="outline">{entry.event}</Badge>
                                        {entry.method && <Badge variant="secondary">{entry.method}</Badge>}
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words">
                                        {JSON.stringify(entry, null, 2)}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}


