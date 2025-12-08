'use client';

import { 
  Zap, 
  Target, 
  BarChart3, 
  Shield, 
  TrendingUp,
  Settings,
  Bell,
  Lock
} from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'Operações Automatizadas',
    description: 'Configure operações automatizadas personalizadas para executar trades de forma inteligente baseadas em sinais externos.',
  },
  {
    icon: Target,
    title: 'Gestão de SL/TP',
    description: 'Defina Stop Loss e Take Profit automaticamente nas suas posições com monitoramento em tempo real.',
  },
  {
    icon: BarChart3,
    title: 'Análise de Performance',
    description: 'Acompanhe seu PnL, ROI, taxa de acerto e muito mais com relatórios detalhados e gráficos interativos.',
  },
  {
    icon: Shield,
    title: 'Segurança Total',
    description: 'Suas credenciais são criptografadas e protegidas. Suporte a 2FA para máxima segurança.',
  },
  {
    icon: Zap,
    title: 'Execução Rápida',
    description: 'Execute operações em milissegundos com nossa infraestrutura otimizada e conexão direta com a Binance.',
  },
  {
    icon: TrendingUp,
    title: 'Múltiplas Contas',
    description: 'Gerencie várias contas da Binance em um único lugar, com separação completa de operações.',
  },
  {
    icon: Settings,
    title: 'Parâmetros Personalizados',
    description: 'Configure parâmetros de trading personalizados para cada estratégia e símbolo.',
  },
  {
    icon: Bell,
    title: 'Notificações em Tempo Real',
    description: 'Receba alertas instantâneos sobre execuções, fechamentos de posição e eventos importantes.',
  },
  {
    icon: Lock,
    title: 'Cofres Virtuais',
    description: 'Organize seu capital em cofres virtuais para melhor controle e gestão de risco.',
  },
];

export function Features() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Funcionalidades Poderosas
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Tudo que você precisa para automatizar e otimizar suas operações de trading
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="p-6 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">{feature.title}</h3>
                </div>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

