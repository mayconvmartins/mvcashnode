# Changelog - MVCash Frontend

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [2.1.0] - 2024-12-18

### 🎨 Layout Redesign v2.1

#### Adicionado

**Sistema de Temas**
- `ThemeToggle` com dropdown (Claro/Escuro/Sistema)
- `ThemeToggleCompact` para uso inline
- Detecção automática da preferência do sistema operacional
- Persistência da escolha do usuário via `localStorage`

**Navegação**
- `MobileBottomNav` - Barra de navegação inferior para mobile com 5 itens
- `Breadcrumbs` - Navegação contextual com caminho atual
- Grupos colapsáveis na Sidebar (Trading, Configuração, Relatórios)
- Sidebar colapsável em modo ícones (desktop)
- Tooltips em itens quando sidebar colapsada

**Dashboard**
- `StatsCard` com variantes: `default`, `gradient`, `minimal`
- `StatsGrid` para layouts responsivos de cards
- `StatsCardSkeleton` para estados de loading
- Suporte a tamanhos: `sm`, `md`, `lg`
- Indicadores de tendência (up/down/neutral)

**Tabelas**
- `ResponsiveFilters` - Filtros inline (desktop) ou drawer (mobile)
- `CardList` - Visualização alternativa para mobile
- `EmptyState` - Componente para estados vazios
- DataTable melhorada com:
  - Header sticky ao scrollar
  - Linhas alternadas (striped)
  - Ações em dropdown quando > 2
  - Paginação simplificada para mobile
  - Colunas ocultáveis em mobile (`hideOnMobile`)

**Formulários**
- `FormField` - Wrapper com label, erro, descrição e tooltip
- `FormSection` - Agrupador de campos
- `FormActions` - Wrapper para botões de ação
- `Input` melhorado com:
  - Variantes: `default`, `ghost`, `filled`
  - Estados: `error`, `success`
  - Suporte a ícones (left/right)
  - Tamanhos: `sm`, `default`, `lg`

**Wizards**
- `ParameterWizard` redesenhado com:
  - Progress bar visual com ícones
  - Steps clicáveis para navegação
  - Indicadores de conclusão
  - Layout responsivo

**Páginas Públicas**
- Subscribe page com hero animado e cards modernos
- Success page com efeito de confetti
- Design celebratório na confirmação

**PWA**
- `UpdatePrompt` - Notificação de atualização disponível
- `InstallPrompt` - Sugestão de instalação do app
- Página offline melhorada
- Suporte a iOS (instruções específicas)

**CSS/Utilities**
- `.safe-area-bottom` / `.safe-area-top` - Safe area para notch
- `.touch-target` - Tamanhos mínimos para touch (44px)
- `.scrollbar-hide` - Ocultar scrollbar
- `.animate-confetti` - Animação de confetti
- `.bg-grid-white\/5` - Pattern de grid

#### Modificado

**Componentes UI**
- `components/ui/input.tsx` - Adicionadas variantes e ícones
- `components/ui/sheet.tsx` - Criado componente Sheet

**Layout**
- `components/layout/Sidebar.tsx` - Redesign completo
- `components/layout/Header.tsx` - Adicionados breadcrumbs
- `app/(dashboard)/layout.tsx` - Integração PWA prompts

**Páginas**
- `app/(dashboard)/page.tsx` - Dashboard redesenhado
- `app/subscribe/page.tsx` - Novo design
- `app/subscribe/success/page.tsx` - Efeito confetti

**Providers**
- `components/providers.tsx` - Tema com detecção automática

#### Arquivos Criados

```
components/
├── layout/
│   ├── MobileBottomNav.tsx
│   └── Breadcrumbs.tsx
├── shared/
│   ├── ResponsiveFilters.tsx
│   ├── CardList.tsx
│   └── FormField.tsx
├── pwa/
│   ├── UpdatePrompt.tsx
│   └── InstallPrompt.tsx
└── ui/
    └── sheet.tsx

app/
└── offline/
    └── page.tsx

docs/
└── LAYOUT_REDESIGN_V2.1.md
```

---

## [2.0.1] - 2024-12-18

### Corrigido
- Passkeys com storage em banco de dados (multi-processo PM2)
- Webhook monitor transaction timeout
- Conditional UI para Passkeys
- Foreign key constraint em snapshots

### Adicionado
- Web Push Notifications
- Sistema de templates de notificação
- Sessões de usuário
- Post-login prompts (notificações e passkeys)

---

## [2.0.0] - 2024-12-XX

### Adicionado
- Sistema completo de assinaturas
- Integração Mercado Pago
- Integração TransFi (crypto)
- Dashboard de assinantes
- Gestão de planos

