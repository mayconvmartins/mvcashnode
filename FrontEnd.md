Plano de Implementação - Frontend Nativo Trading Automation
Visão Geral
Desenvolvimento de um frontend nativo moderno e recursivo para a aplicação Node.js de automação de trading, totalmente integrado com o backend existente. O frontend será construído com Next.js, TailwindCSS e tecnologias modernas, oferecendo uma experiência premium e responsiva.

Objetivos
Interface Premium: Design moderno, vibrante e profissional com glassmorphism, gradientes suaves e animações dinâmicas
Integração Total: Consumir todos os endpoints da API documentada em 
api.json
Experiência Recursiva: Componentes reutilizáveis e modulares seguindo princípios DRY
Performance: Otimizado para carregamento rápido e atualizações em tempo real
Responsividade: Mobile-first, adaptável a todos os dispositivos
Tecnologias Principais
Core Framework
Next.js 14+: App Router, Server Components, API Routes
React 18+: Hooks, Context API, Suspense
TypeScript: Type-safety completo
Estilização e UI
TailwindCSS: Utility-first CSS framework
shadcn/ui: Componentes base de alta qualidade
Framer Motion: Animações suaves e interativas
Recharts: Gráficos e visualizações
Lucide Icons: Ícones modernos
Estado e Data Fetching
Zustand: State management leve e eficiente
TanStack Query (React Query): Cache, sincronização e updates de dados
Axios: Cliente HTTP configurado
Utilitários
date-fns: Manipulação de datas
zod: Validação de schemas
react-hook-form: Formulários performáticos
Arquitetura do Frontend
frontend/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Rotas de autenticação
│   │   ├── login/
│   │   └── setup-2fa/
│   ├── (dashboard)/              # Rotas protegidas
│   │   ├── layout.tsx            # Layout com sidebar
│   │   ├── page.tsx              # Dashboard principal
│   │   ├── accounts/             # Contas de exchange
│   │   ├── vaults/               # Cofres
│   │   ├── parameters/           # Parâmetros de trading
│   │   ├── webhooks/             # Webhook sources
│   │   ├── positions/            # Posições
│   │   ├── limit-orders/         # Ordens LIMIT
│   │   ├── operations/           # Jobs e execuções
│   │   ├── reports/              # Relatórios
│   │   ├── notifications/        # Notificações
│   │   └── admin/                # Área administrativa
│   └── api/                      # API routes (proxy, etc)
├── components/
│   ├── ui/                       # Componentes base (shadcn/ui)
│   ├── layout/                   # Layout components
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Breadcrumbs.tsx
│   ├── dashboard/                # Dashboard específicos
│   ├── forms/                    # Form components
│   ├── tables/                   # Table components
│   ├── charts/                   # Chart components
│   └── shared/                   # Shared components
├── lib/
│   ├── api/                      # API client e services
│   │   ├── client.ts             # Axios instance
│   │   ├── auth.service.ts
│   │   ├── accounts.service.ts
│   │   ├── vaults.service.ts
│   │   ├── positions.service.ts
│   │   ├── reports.service.ts
│   │   └── ...
│   ├── hooks/                    # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── usePositions.ts
│   │   ├── useWebSocket.ts
│   │   └── ...
│   ├── stores/                   # Zustand stores
│   │   ├── authStore.ts
│   │   ├── themeStore.ts
│   │   └── uiStore.ts
│   ├── utils/                    # Utility functions
│   │   ├── format.ts
│   │   ├── validation.ts
│   │   └── constants.ts
│   └── types/                    # TypeScript types/interfaces
├── public/                       # Assets estáticos
└── styles/
    └── globals.css               # Global styles + Tailwind
Proposta de Design
Tema de Cores
/* Dark Mode (Principal) */
--background: 222.2 84% 4.9%         /* #0a0a11 - Quase preto com toque de azul */
--foreground: 210 40% 98%            /* #f9fafb - Off-white */
--card: 222.2 84% 6%                 /* #0d0d15 - Card background */
--card-foreground: 210 40% 98%
--primary: 217.2 91.2% 59.8%         /* #3b82f6 - Azure vibrante */
--primary-foreground: 222.2 47.4% 11.2%
--secondary: 142.1 76.2% 36.3%       /* #10b981 - Verde esmeralda */
--accent: 270 60% 60%                /* #a855f7 - Roxo vibrante */
--destructive: 0 84.2% 60.2%         /* #ef4444 - Vermelho */
--border: 217.2 32.6% 17.5%
--radius: 0.5rem
/* Gradientes */
--gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
--gradient-success: linear-gradient(135deg, #10b981 0%, #059669 100%)
--gradient-danger: linear-gradient(135deg, #ef4444 0%, #dc2626 100%)
--gradient-accent: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)
Componentes de Design
Glassmorphism Cards

Background semi-transparente
Backdrop blur
Bordas sutis com gradiente
Sombras suaves
Animações Micro-interações

Hover effects nos botões e cards
Transições suaves de página
Loading skeletons
Toast notifications animadas
Tipografia

Font primária: Inter (Google Fonts)
Font numérica: JetBrains Mono (para valores)
Hierarquia clara (h1-h6)
Gráficos e Visualizações

Cores vibrantes coordenadas com o tema
Tooltips informativos
Animações ao carregar
Responsivos
Páginas Principais
1. Dashboard Overview
Rota: /

Componentes:

Stats Cards:
Posições abertas (REAL/SIM)
PnL do dia
Total de trades
Taxa de acerto
PnL Chart: Gráfico de linha dos últimos 30 dias
Recent Positions Table: 10 posições mais recentes
Webhook Activity: Últimos eventos de webhook
Alerts Panel: Notificações importantes
API Endpoints:

GET /reports/pnl/summary
GET /reports/pnl/by-day
GET /positions?status=OPEN&limit=10
GET /webhook-events?limit=10
GET /reports/open-positions/summary
2. Exchange Accounts
Rota: /accounts

Funcionalidades:

Lista de contas com status (ativa/inativa)
Badge para simulação vs real
Teste de conexão em tempo real
CRUD completo
Modal de confirmação para delete
API Endpoints:

GET /exchange-accounts
POST /exchange-accounts
PUT /exchange-accounts/:id
DELETE /exchange-accounts/:id
POST /exchange-accounts/:id/test-connection
3. Vaults (Cofres)
Rota: /vaults

Funcionalidades:

Lista de cofres com saldos resumidos
Detalhes do cofre com tabs:
Saldos por asset
Histórico de transações
Gráfico de evolução
Depositar/Sacar com modal
Filtro REAL/SIMULATION
API Endpoints:

GET /vaults
POST /vaults
GET /vaults/:id/balances
GET /vaults/:id/transactions
POST /vaults/:id/deposit
POST /vaults/:id/withdraw
4. Trade Parameters
Rota: /parameters

Funcionalidades:

Tabela de parâmetros agrupada por conta
Form wizard para criar parâmetro:
Passo 1: Account + Symbol + Side
Passo 2: Order size
Passo 3: SL/TP defaults
Passo 4: Limits e cofre
Duplicate parameter
Templates salvos
API Endpoints:

GET /trade-parameters
POST /trade-parameters
PUT /trade-parameters/:id
DELETE /trade-parameters/:id
5. Webhook Sources
Rota: /webhooks

Funcionalidades:

Lista de sources com URL de webhook
Copy to clipboard para URL
Formulário de criação:
Gerar código único
Configurar IPs permitidos
Assinatura HMAC
Rate limit
Gerenciar bindings (adicionar/remover contas)
Visualizar eventos recebidos
API Endpoints:

GET /webhook-sources
POST /webhook-sources
PUT /webhook-sources/:id
GET /webhook-sources/:id/bindings
POST /webhook-sources/:id/bindings
GET /webhook-events?webhookSourceId=:id
6. Positions
Rota: /positions

Funcionalidades:

Tabs: OPEN / CLOSED
Filtros: trade_mode, account, symbol, período
Tabela com:
Symbol, Qty, Entry Price
Current Price (atualizado)
PnL não realizado (verde/vermelho)
SL/TP indicators
Actions menu
Página de detalhes:
Chart de preço
Fills history
Actions: Update SL/TP, Close, Sell Limit, Lock webhook
API Endpoints:

GET /positions
GET /positions/:id
PUT /positions/:id/sltp
PUT /positions/:id/lock-sell-by-webhook
POST /positions/:id/close
POST /positions/:id/sell-limit
7. Limit Orders
Rota: /limit-orders

Funcionalidades:

Filtros: status, side, trade_mode, symbol
Tabela de ordens pendentes
Detalhes da ordem com status da exchange
Cancelar ordem
Histórico de ordens executadas/canceladas
API Endpoints:

GET /limit-orders
GET /limit-orders/:id
DELETE /limit-orders/:id
GET /limit-orders/history
8. Operations (Jobs & Executions)
Rota: /operations

Funcionalidades:

View combinada de jobs + execuções
Timeline de processamento
Filtros: trade_mode, status, período
Detalhes expandidos
API Endpoints:

GET /operations
GET /trade-jobs/:id
GET /trade-executions/:id
9. Reports
Rota: /reports

Subpáginas:

9.1 PnL Dashboard (/reports/pnl)
Resumo geral
Gráfico de PnL por dia
PnL por símbolo (tabela + chart)
Comparação REAL vs SIMULATION
API Endpoints:

GET /reports/pnl/summary
GET /reports/pnl/by-day
GET /reports/pnl/by-symbol
9.2 Open Positions (/reports/open-positions)
Exposição por símbolo
PnL não realizado
Distribuição por conta
API Endpoints:

GET /reports/open-positions/summary
9.3 Vaults (/reports/vaults)
Saldos consolidados
Volume movimentado
API Endpoints:

GET /reports/vaults/summary
9.4 Webhooks (/reports/webhooks)
Performance por source
Taxa de conversão
Estatísticas de bloqueio
API Endpoints:

GET /reports/webhooks/summary
10. Admin Area
Rota: /admin

Funcionalidades:

10.1 Users Management (/admin/users)
Lista de usuários com filtros
CRUD completo
Reset password, reset 2FA
Ativar/desativar
Visualizar audit logs
API Endpoints:

GET /admin/users
POST /admin/users
PUT /admin/users/:id
DELETE /admin/users/:id
POST /admin/users/:id/activate
POST /admin/users/:id/reset-password
GET /admin/users/:id/audit-logs
10.2 System Health (/admin/health)
Status de serviços
Métricas do sistema
Conectividade
API Endpoints:

GET /admin/health
GET /admin/metrics
10.3 Audit Logs (/admin/audit)
Logs de usuários
Logs do sistema
Filtros avançados
Exportação
API Endpoints:

GET /admin/audit-logs
GET /admin/audit-logs/system
GET /admin/audit-logs/:id
Estratégia de Integração com API
1. Cliente HTTP (Axios)
// lib/api/client.ts
import axios from 'axios';
import { authStore } from '@/lib/stores/authStore';
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010',
  headers: {
    'Content-Type': 'application/json',
  },
});
// Request interceptor para adicionar token
apiClient.interceptors.request.use((config) => {
  const token = authStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
// Response interceptor para refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = authStore.getState().refreshToken;
        const { data } = await axios.post('/auth/refresh', { refreshToken });
        
        authStore.getState().setTokens(data.accessToken, data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        authStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
2. Services Layer
Criar um service para cada domínio da API:

// lib/api/positions.service.ts
import { apiClient } from './client';
import type { Position, PositionFilters, UpdateSLTPDto } from '@/lib/types';
export const positionsService = {
  list: (filters?: PositionFilters) => 
    apiClient.get<Position[]>('/positions', { params: filters }),
    
  getOne: (id: number) => 
    apiClient.get<Position>(`/positions/${id}`),
    
  updateSLTP: (id: number, data: UpdateSLTPDto) =>
    apiClient.put(`/positions/${id}/sltp`, data),
    
  close: (id: number, quantity?: number) =>
    apiClient.post(`/positions/${id}/close`, { quantity }),
    
  // ... outros métodos
};
3. React Query Hooks
// lib/hooks/usePositions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { positionsService } from '@/lib/api/positions.service';
import type { PositionFilters } from '@/lib/types';
export function usePositions(filters?: PositionFilters) {
  return useQuery({
    queryKey: ['positions', filters],
    queryFn: () => positionsService.list(filters),
    refetchInterval: 30000, // Refetch a cada 30s
  });
}
export function usePosition(id: number) {
  return useQuery({
    queryKey: ['positions', id],
    queryFn: () => positionsService.getOne(id),
    enabled: !!id,
  });
}
export function useUpdatePositionSLTP() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSLTPDto }) =>
      positionsService.updateSLTP(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['positions', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}
Componentes Reutilizáveis Chave
1. DataTable
Tabela genérica com paginação, sorting, filtros:

<DataTable
  data={positions}
  columns={positionsColumns}
  pagination
  filters={<PositionsFilters />}
  loading={isLoading}
  emptyState={<EmptyPositions />}
/>
2. StatsCard
Card de estatística com ícone, valor e variação:

<StatsCard
  title="PnL do Dia"
  value="$1,234.56"
  change={+12.5}
  icon={<TrendingUp />}
  loading={isLoading}
/>
3. ModeToggle
Toggle para alternar entre REAL e SIMULATION:

<ModeToggle
  value={tradeMode}
  onChange={setTradeMode}
/>
4. PnLBadge
Badge colorido para exibir PnL:

<PnLBadge value={123.45} />  // Verde
<PnLBadge value={-45.67} />  // Vermelho
5. SymbolDisplay
Exibir símbolo com ícone da exchange:

<SymbolDisplay exchange="BINANCE_SPOT" symbol="SOL/USDT" />
Sequência de Implementação Recomendada
Sprint 1: Fundação (Semanas 1-2)
Setup do projeto Next.js com todas as dependências
Configurar TailwindCSS e design system
Implementar componentes base (shadcn/ui)
Criar API client e services básicos
Implementar autenticação completa (login, 2FA, guards)
Criar layout principal com sidebar e header
Sprint 2: Core Features (Semanas 3-4)
Dashboard Overview
Exchange Accounts (CRUD)
Vaults (CRUD + Deposit/Withdraw)
Trade Parameters (CRUD)
Sprint 3: Trading Features (Semanas 5-6)
Webhook Sources e Bindings
Webhook Events
Positions (lista, detalhes, ações)
Limit Orders
Sprint 4: Reports & Analytics (Semana 7)
PnL Dashboard
Open Positions Report
Vaults Report
Webhooks Report
Sprint 5: Admin & Polish (Semana 8)
Admin área (users, health, audit)
Notifications
Otimizações de performance
Testes e correções
Sprint 6: Final (Semana 9)
Real-time updates (WebSocket)
PWA setup
Documentação
Deploy e CI/CD
Checklist de Qualidade
IMPORTANT

Critérios de Qualidade Obrigatórios

 Design Premium: Interface visualmente impressionante com gradientes, glassmorphism e animações
 Integração Completa: Todos os endpoints da API documentados devem ser consumidos
 Responsividade Total: Funcional em mobile, tablet e desktop
 Performance: Time to Interactive < 3s, Lighthouse score > 90
 Acessibilidade: WCAG 2.1 AA compliant
 Type Safety: 100% TypeScript, sem any
 Error Handling: Tratamento adequado de erros em todos os fluxos
 Loading States: Skeletons ou loaders em todas as operações assíncronas
 Empty States: Mensagens e ações claras quando não há dados
 Real-time: Dados atualizados periodicamente ou via WebSocket
Considerações Técnicas
SEO
Titles e meta descriptions em todas as páginas
Open Graph tags para compartilhamento
Sitemap.xml gerado automaticamente
Segurança
Validação de inputs com Zod
CSRF protection
XSS prevention (sanitização de inputs)
Rate limiting no frontend (debounce)
Performance
Code splitting automático (Next.js)
Lazy loading de componentes pesados
Otimização de imagens (Next.js Image)
Memoização de componentes (React.memo, useMemo)
Monitoramento
Error tracking (Sentry ou similar)
Analytics (Google Analytics ou Vercel Analytics)
Performance monitoring (Web Vitals)
Próximos Passos
Aprovar este plano e iniciar implementação
Setup inicial do projeto Next.js
Desenvolver iterativamente seguindo os sprints
Reviews regulares a cada sprint completado
Deploy contínuo em ambiente de staging






TASKS

Frontend Nativo - Trading Automation
Fase 1: Setup e Estrutura Base
 Criar projeto Next.js com TypeScript
 Configurar TailwindCSS com tema personalizado
 Instalar e configurar bibliotecas essenciais (Axios, React Query, Zustand)
 Configurar estrutura de pastas (components, pages, services, hooks, stores)
 Criar sistema de design tokens (cores, tipografia, espaçamentos)
Fase 2: Autenticação e Usuário
 Criar página de Login com suporte a 2FA
 Implementar serviço de autenticação (JWT, refresh token)
 Criar context/store de autenticação
 Implementar guards de rota (privadas/públicas)
 Criar página de perfil do usuário
 Implementar histórico de login
 Criar fluxo de setup 2FA (QR code)
Fase 3: Layout e Navegação
 Criar layout principal com sidebar
 Implementar menu de navegação responsivo
 Criar header com informações do usuário
 Implementar tema dark/light mode
 Criar breadcrumbs
 Implementar notificações toast
Fase 4: Dashboard Principal
 Página de Dashboard Overview
 Cards de resumo (posições abertas, PnL do dia, total de trades)
 Gráfico de PnL por dia (últimos 30 dias)
 Lista de posições abertas recentes
 Atividade de webhooks recentes
 Alertas e notificações importantes
 Integração com endpoints de reports
Fase 5: Contas de Exchange
 Página de listagem de contas
 Formulário de criação de conta
 Suporte a conta real e simulação
 Validação de credenciais
 Teste de conexão
 Página de edição de conta
 Modal de confirmação para deletar conta
 Indicadores de status (ativa/inativa, testnet)
Fase 6: Cofres Virtuais (Vaults)
 Página de listagem de cofres
 Formulário de criação de cofre
 Página de detalhes do cofre
 Visualização de saldos por asset
 Histórico de transações (paginado)
 Gráfico de evolução do saldo
 Funcionalidades de depósito e saque
 Filtros por modo (REAL/SIMULATION)
Fase 7: Parâmetros de Trading
 Página de listagem de parâmetros
 Formulário de criação/edição de parâmetros
 Seleção de exchange account
 Configuração de símbolo e side
 Configuração de tamanho de ordem
 Configuração de SL/TP padrão
 Configuração de limites de frequência
 Vinculação com cofres
 Templates de parâmetros
Fase 8: Webhook Sources
 Página de listagem de webhook sources
 Formulário de criação de webhook source
 Geração de código único
 Configuração de modo (REAL/SIMULATION)
 Configuração de segurança (IPs, assinatura)
 Rate limiting
 Página de detalhes com URL de webhook
 Gerenciamento de bindings
 Adicionar/remover contas vinculadas
 Configuração de weight
 Visualização de eventos recebidos
Fase 9: Webhook Events
 Página de listagem de eventos
 Filtros (source, status, trade_mode, período)
 Página de detalhes do evento
 Payload raw
 Informações parseadas
 Jobs criados
 Erros de validação
 Indicadores visuais de status
Fase 10: Posições (Positions)
 Página de listagem de posições
 Filtros (status, trade_mode, account, symbol, período)
 Tabs para OPEN/CLOSED
 Cálculo de PnL não realizado (preço atual)
 Indicadores de SL/TP ativo
 Página de detalhes da posição
 Informações completas
 Histórico de fills
 Gráfico de evolução de preço
 Funcionalidades de ação
 Atualizar SL/TP
 Lock/unlock venda por webhook
 Fechar posição (total/parcial)
 Vender com ordem LIMIT
 Real-time updates (polling ou WebSocket)
Fase 11: Ordens LIMIT
 Página de listagem de ordens LIMIT
 Filtros (status, side, trade_mode, symbol)
 Página de detalhes da ordem
 Funcionalidade de cancelamento
 Histórico de ordens executadas/canceladas
Fase 12: Jobs e Execuções
 Página de operações (view combinada)
 Filtros (trade_mode, status, período)
 Detalhes de job
 Detalhes de execução
 Timeline de processamento
Fase 13: Relatórios e Analytics
 Dashboard de PnL
 Resumo geral (lucro, prejuízo, taxa de acerto)
 Gráfico de PnL por dia
 PnL por símbolo (tabela e gráfico)
 Comparação REAL vs SIMULATION
 Relatório de posições abertas
 Exposição por símbolo
 PnL não realizado
 Distribuição por conta
 Relatório de cofres
 Saldos consolidados
 Volume movimentado
 Relatório de webhooks
 Performance por source
 Taxa de conversão (evento → job → execução)
 Estatísticas de bloqueio
 Exportação de relatórios (CSV, JSON)
 Seleção de período customizada
Fase 14: Área Administrativa
 Dashboard administrativo
 Métricas do sistema
 Health check de serviços
 Usuários ativos
 Gerenciamento de usuários
 Listagem com filtros
 Criar/editar/deletar usuários
 Reset de senha
 Ativar/desativar contas
 Reset 2FA
 Visualizar sessões ativas
 Logs de auditoria
 Auditoria de usuários
 Auditoria do sistema
 Filtros avançados
 Exportação
 Gerenciamento de Crons
 Listagem de jobs agendados
 Status e histórico de execução
 Executar job manualmente
 Pausar/retomar jobs
 Configurar intervalo
 Configurações do sistema
 Feature flags
 Configurações globais
Fase 15: Notificações
 Página de configuração de notificações WhatsApp
 Toggle de tipos de alerta
 Configuração de números
 Histórico de notificações enviadas
Fase 16: Recursos Avançados
 Modo de simulação destacado
 Badge/indicator em toda interface
 Páginas dedicadas para simulação
 WebSocket para updates em tempo real
 PWA (Progressive Web App)
 Modo offline (cache de dados essenciais)
 Atalhos de teclado
 Tutorial/onboarding para novos usuários
 Ajuda contextual/tooltips
Fase 17: Otimizações e Polimento
 Performance
 Code splitting
 Lazy loading de componentes
 Otimização de imagens
 Debounce de filtros
 UX/UI
 Loading states
 Empty states
 Error states
 Skeleton loaders
 Animações e transições
 Responsividade
 Mobile first
 Tablet layouts
 Desktop optimizations
 Acessibilidade
 ARIA labels
 Navegação por teclado
 Contraste de cores
 Screen reader support
Fase 18: Testes e Documentação
 Testes unitários (componentes principais)
 Testes de integração (fluxos críticos)
 Documentação de componentes (Storybook)
 Guia de uso para usuários finais
 README técnico do frontend
Fase 19: Deploy e CI/CD
 Configurar build de produção
 Variáveis de ambiente
 Docker setup (opcional)
 CI/CD pipeline
 Deploy em ambiente de staging
 Deploy em produção