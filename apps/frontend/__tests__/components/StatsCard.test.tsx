import { render, screen } from '@testing-library/react'
import { StatsCard } from '@/components/shared/StatsCard'
import { TrendingUp } from 'lucide-react'

describe('StatsCard', () => {
  it('renderiza o título e valor corretamente', () => {
    render(
      <StatsCard
        title="Total de Posições"
        value="42"
        icon={TrendingUp}
      />
    )

    expect(screen.getByText('Total de Posições')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('exibe trend positiva quando fornecida', () => {
    render(
      <StatsCard
        title="PnL"
        value="$1000"
        icon={TrendingUp}
        trend={{ value: 15.5, direction: 'up' }}
      />
    )

    expect(screen.getByText('+15.5%')).toBeInTheDocument()
  })

  it('exibe trend negativa quando fornecida', () => {
    render(
      <StatsCard
        title="PnL"
        value="$-500"
        icon={TrendingUp}
        trend={{ value: -10.2, direction: 'down' }}
      />
    )

    expect(screen.getByText('-10.2%')).toBeInTheDocument()
  })

  it('não exibe trend quando não fornecida', () => {
    const { container } = render(
      <StatsCard
        title="Total"
        value="100"
        icon={TrendingUp}
      />
    )

    expect(container.querySelector('.text-green-500')).not.toBeInTheDocument()
    expect(container.querySelector('.text-destructive')).not.toBeInTheDocument()
  })
})

