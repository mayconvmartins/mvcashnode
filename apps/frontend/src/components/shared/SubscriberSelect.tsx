'use client'

import { useState, useMemo } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Subscriber {
  id: number
  email: string
  profile?: { full_name?: string } | null
}

interface SubscriberSelectProps {
  subscribers: Subscriber[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  allLabel?: string
  className?: string
  disabled?: boolean
}

export function SubscriberSelect({
  subscribers,
  value,
  onValueChange,
  placeholder = 'Selecione um assinante',
  allLabel = 'Todos',
  className,
  disabled = false,
}: SubscriberSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Filtrar assinantes pelo termo de busca
  const filteredSubscribers = useMemo(() => {
    if (!searchTerm.trim()) return subscribers || []
    const term = searchTerm.toLowerCase()
    return (subscribers || []).filter(
      (sub) =>
        sub.email.toLowerCase().includes(term) ||
        sub.profile?.full_name?.toLowerCase().includes(term)
    )
  }, [subscribers, searchTerm])

  // Encontrar assinante selecionado
  const selectedSubscriber = useMemo(() => {
    if (!value || value === 'all' || value === 'ALL') return null
    return subscribers?.find((sub) => sub.id.toString() === value)
  }, [subscribers, value])

  const handleSelect = (subscriberId: string) => {
    onValueChange(subscriberId)
    setOpen(false)
    setSearchTerm('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValueChange('all')
    setSearchTerm('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between', className)}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedSubscriber ? selectedSubscriber.email : placeholder}
          </span>
          <div className="flex items-center gap-1 ml-2">
            {selectedSubscriber && (
              <X
                className="h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        {/* Campo de busca */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Buscar por email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2"
          />
        </div>
        
        {/* Lista de opções */}
        <div className="max-h-[300px] overflow-auto">
          {/* Opção "Todos" */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent',
              (!value || value === 'all' || value === 'ALL') && 'bg-accent'
            )}
            onClick={() => handleSelect('all')}
          >
            <Check
              className={cn(
                'h-4 w-4',
                (!value || value === 'all' || value === 'ALL') ? 'opacity-100' : 'opacity-0'
              )}
            />
            <span className="font-medium">{allLabel}</span>
          </div>
          
          {/* Lista de assinantes filtrados */}
          {filteredSubscribers.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum assinante encontrado
            </div>
          ) : (
            filteredSubscribers.map((subscriber) => (
              <div
                key={subscriber.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent',
                  value === subscriber.id.toString() && 'bg-accent'
                )}
                onClick={() => handleSelect(subscriber.id.toString())}
              >
                <Check
                  className={cn(
                    'h-4 w-4',
                    value === subscriber.id.toString() ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm">{subscriber.email}</span>
                  {subscriber.profile?.full_name && (
                    <span className="truncate text-xs text-muted-foreground">
                      {subscriber.profile.full_name}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

