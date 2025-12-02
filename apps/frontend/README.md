# Trading Automation - Frontend

Frontend moderno e responsivo para o sistema de automação de trading, construído com Next.js 16, React 18, TypeScript e TailwindCSS.

## 🚀 Tecnologias

- **Next.js 16** - App Router, Server Components, API Routes
- **React 18** - Hooks, Context API, Suspense
- **TypeScript** - Type-safety completo
- **TailwindCSS** - Utility-first CSS framework
- **shadcn/ui** - Componentes base de alta qualidade
- **Framer Motion** - Animações suaves
- **Recharts** - Gráficos e visualizações
- **Lucide Icons** - Ícones modernos
- **Zustand** - State management
- **TanStack Query** - Data fetching e cache
- **Axios** - Cliente HTTP
- **date-fns** - Manipulação de datas
- **Zod** - Validação de schemas
- **react-hook-form** - Formulários performáticos
- **Sonner** - Toast notifications

## 📁 Estrutura do Projeto

```
apps/frontend/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/             # Rotas de autenticação
│   │   │   ├── login/
│   │   │   └── setup-2fa/
│   │   ├── (dashboard)/        # Rotas protegidas
│   │   │   ├── accounts/       # Contas de exchange
│   │   │   ├── vaults/         # Cofres virtuais
│   │   │   ├── parameters/     # Parâmetros de trading
│   │   │   ├── webhooks/       # Webhook sources
│   │   │   ├── positions/      # Posições
│   │   │   ├── reports/        # Relatórios
│   │   │   └── admin/          # Área administrativa
│   │   ├── layout.tsx          # Layout raiz
│   │   └── globals.css         # Estilos globais
│   ├── components/
│   │   ├── ui/                 # Componentes base (shadcn/ui)
│   │   ├── layout/             # Layout components
│   │   ├── shared/             # Componentes compartilhados
│   │   ├── accounts/           # Componentes de contas
│   │   ├── vaults/             # Componentes de cofres
│   │   └── auth/               # Componentes de autenticação
│   ├── lib/
│   │   ├── api/                # API client e services
│   │   ├── hooks/              # Custom hooks
│   │   ├── stores/             # Zustand stores
│   │   ├── utils/              # Utility functions
│   │   └── types/              # TypeScript types
│   └── public/                 # Assets estáticos
└── package.json
```

## 🎨 Design System

### Tema de Cores

- **Background**: `#0a0a11` (Dark mode principal)
- **Primary**: `#3b82f6` (Azure vibrante)
- **Secondary**: `#10b981` (Verde esmeralda)
- **Accent**: `#a855f7` (Roxo vibrante)
- **Destructive**: `#ef4444` (Vermelho)

### Componentes

- **Glassmorphism**: Background semi-transparente com blur
- **Gradientes**: Animações e transições suaves
- **Responsivo**: Mobile-first design
- **Acessível**: WCAG 2.1 AA compliant

## 🔐 Autenticação

- Login com email/senha
- Autenticação de 2 fatores (TOTP)
- JWT com refresh token automático
- Guards de rota (middleware + componente)
- Proteção de rotas admin

## 📊 Funcionalidades Principais

### Dashboard
- Cards de estatísticas em tempo real
- Gráfico de PnL por dia
- Posições abertas recentes
- Atividade de webhooks

### Contas de Exchange
- CRUD completo
- Teste de conexão em tempo real
- Suporte a Binance e Bybit (Spot/Futures)
- Modo REAL/SIMULATION
- Testnet support

### Cofres Virtuais
- Gerenciamento de saldos
- Depósito/Saque
- Histórico de transações
- Visualização por asset

### Parâmetros de Trading
- Wizard de 4 passos
- Configuração de SL/TP
- Trailing stop
- Templates salvos

### Webhooks
- Criação e gerenciamento
- Copy to clipboard
- Rate limiting
- Bindings com contas
- Visualização de eventos

### Posições
- Tabs OPEN/CLOSED
- Filtros avançados
- PnL não realizado
- Real-time updates (polling 30s)
- Ações: Update SL/TP, Close, Sell Limit

### Relatórios
- PnL por dia/símbolo
- Taxa de acerto
- Comparação REAL vs SIMULATION
- Exportação CSV/JSON

### Área Administrativa
- Gerenciamento de usuários
- System health
- Audit logs
- Métricas do sistema

## 🚀 Como Executar

### Pré-requisitos

- Node.js 18+
- pnpm 8+

### Instalação

```bash
# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env.local

# Editar .env.local com suas configurações
# NEXT_PUBLIC_API_URL=http://localhost:4010
```

### Desenvolvimento

```bash
# Iniciar servidor de desenvolvimento
pnpm dev

# Abrir http://localhost:3000
```

### Build de Produção

```bash
# Criar build otimizado
pnpm build

# Iniciar servidor de produção
pnpm start
```

## 📝 Scripts Disponíveis

- `pnpm dev` - Inicia o servidor de desenvolvimento
- `pnpm build` - Cria build de produção
- `pnpm start` - Inicia servidor de produção
- `pnpm lint` - Executa o linter
- `pnpm type-check` - Verifica tipos TypeScript

## 🔧 Configuração

### Variáveis de Ambiente

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:4010
NEXT_PUBLIC_WS_URL=ws://localhost:4010

# Environment
NEXT_PUBLIC_ENV=development
```

## 🎯 Performance

- **Code Splitting**: Automático por rota (Next.js)
- **Lazy Loading**: Componentes pesados carregados sob demanda
- **Memoização**: React.memo para componentes críticos
- **Image Optimization**: next/image para otimização automática
- **Debounce**: Filtros e buscas otimizados (300ms)

## ♿ Acessibilidade

- ARIA labels em todos os componentes interativos
- Navegação por teclado completa
- Contraste de cores WCAG 2.1 AA
- Screen reader support
- Skip links

## 🔄 Real-time Updates

- Polling automático a cada 30s para posições
- WebSocket (a ser implementado)
- React Query para cache inteligente
- Invalidação automática de queries

## 🎨 Customização

### Adicionar Novo Componente UI

```bash
# shadcn/ui CLI
npx shadcn-ui@latest add [component-name]
```

### Criar Novo Hook

```typescript
// src/lib/hooks/useExample.ts
export function useExample() {
  // Hook logic
}
```

### Criar Novo Service

```typescript
// src/lib/api/example.service.ts
import { apiClient } from './client'

export const exampleService = {
  list: () => apiClient.get('/examples'),
  // ... outros métodos
}
```

## 📦 Build

O projeto utiliza o App Router do Next.js 16 com:

- Server Components por padrão
- Client Components marcados com 'use client'
- API Routes para proxy (se necessário)
- Otimizações automáticas de bundle

## 🐛 Troubleshooting

### Erro de CORS

Verifique se o backend está configurado para aceitar requisições do frontend:

```typescript
// Backend config
cors: {
  origin: 'http://localhost:3000',
  credentials: true,
}
```

### Erro de Autenticação

Limpe o localStorage e cookies:

```javascript
localStorage.clear()
// Recarregue a página
```

## 📄 Licença

Este projeto é privado e confidencial.

## 👥 Contribuindo

1. Crie uma branch para sua feature
2. Commit suas mudanças
3. Push para a branch
4. Abra um Pull Request

## 🔗 Links Úteis

- [Next.js Documentation](https://nextjs.org/docs)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [TanStack Query](https://tanstack.com/query)
