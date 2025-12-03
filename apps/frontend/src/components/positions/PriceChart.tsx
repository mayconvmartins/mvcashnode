'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useEffect, useState } from 'react'

interface PriceChartProps {
    symbol: string
    entryPrice: number
    stopLoss?: number | null
    takeProfit?: number | null
}

export function PriceChart({ symbol, entryPrice, stopLoss, takeProfit }: PriceChartProps) {
    const [data, setData] = useState<any[]>([])

    useEffect(() => {
        // Simular dados do gráfico (em produção, buscar de API real)
        const generateMockData = () => {
            const points = 50
            const volatility = entryPrice * 0.02 // 2% de volatilidade
            const mockData = []
            
            for (let i = 0; i < points; i++) {
                const randomChange = (Math.random() - 0.5) * volatility
                const price: number = i === 0 
                    ? entryPrice 
                    : mockData[i - 1].price + randomChange
                
                mockData.push({
                    time: `${i}h`,
                    price: parseFloat(price.toFixed(2)),
                })
            }
            
            return mockData
        }

        setData(generateMockData())
    }, [entryPrice])

    if (data.length === 0) {
        return <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Carregando gráfico...
        </div>
    }

    return (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                    dataKey="time" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                    domain={['auto', 'auto']}
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                    contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                    }}
                />
                <Legend />
                
                {/* Linha de entrada */}
                <ReferenceLine 
                    y={entryPrice} 
                    stroke="hsl(var(--primary))" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Entrada', fill: 'hsl(var(--primary))' }}
                />
                
                {/* Linha de Stop Loss */}
                {stopLoss && (
                    <ReferenceLine 
                        y={stopLoss} 
                        stroke="hsl(var(--destructive))" 
                        strokeDasharray="3 3" 
                        label={{ value: 'SL', fill: 'hsl(var(--destructive))' }}
                    />
                )}
                
                {/* Linha de Take Profit */}
                {takeProfit && (
                    <ReferenceLine 
                        y={takeProfit} 
                        stroke="hsl(220 70% 50%)" 
                        strokeDasharray="3 3" 
                        label={{ value: 'TP', fill: 'hsl(220 70% 50%)' }}
                    />
                )}
                
                <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    name="Preço"
                />
            </LineChart>
        </ResponsiveContainer>
    )
}

