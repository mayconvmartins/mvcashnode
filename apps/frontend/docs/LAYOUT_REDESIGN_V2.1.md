# MVCash Layout Redesign v2.1

## Visão Geral

Este documento descreve todas as melhorias de UI/UX implementadas no redesign do layout v2.1, focando em:

- Sistema de temas claro/escuro com detecção automática
- Navegação responsiva e intuitiva
- Componentes modernos e acessíveis
- Experiência mobile-first com suporte PWA

---

## 📋 Índice

1. [Sistema de Temas](#1-sistema-de-temas)
2. [Navegação e Layout](#2-navegação-e-layout)
3. [Dashboard e Cards](#3-dashboard-e-cards)
4. [Tabelas e Listagens](#4-tabelas-e-listagens)
5. [Formulários e Wizards](#5-formulários-e-wizards)
6. [Páginas Públicas](#6-páginas-públicas)
7. [PWA e Mobile](#7-pwa-e-mobile)

---

## 1. Sistema de Temas

### Arquivos Modificados
- `components/providers.tsx`
- `components/shared/ThemeToggle.tsx`

### Melhorias

#### ThemeToggle com Dropdown
O toggle de tema agora oferece três opções:
- **Claro**: Força o tema claro
- **Escuro**: Força o tema escuro  
- **Sistema**: Detecta automaticamente a preferência do sistema operacional

```tsx
import { ThemeToggle } from '@/components/shared/ThemeToggle'

// No Header ou qualquer lugar
<ThemeToggle />

// Versão compacta (cicla entre temas ao clicar)
import { ThemeToggleCompact } from '@/components/shared/ThemeToggle'
<ThemeToggleCompact />
```

#### Detecção Automática
O provider agora usa `enableSystem={true}` por padrão, permitindo que o app siga a preferência do sistema.

```tsx
// providers.tsx
<ThemeProvider 
    attribute="class" 
    defaultTheme="system"    // Usa preferência do sistema
    enableSystem={true}      // Habilita detecção automática
    storageKey="mvcash-theme"
/>
```

---

## 2. Navegação e Layout

### Arquivos Criados/Modificados
- `components/layout/Sidebar.tsx` (modificado)
- `components/layout/MobileBottomNav.tsx` (novo)
- `components/layout/Breadcrumbs.tsx` (novo)
- `components/layout/Header.tsx` (modificado)

### Sidebar Redesenhada

#### Grupos Colapsáveis
O menu lateral agora organiza itens em grupos lógicos:

| Grupo | Itens |
|-------|-------|
| **Trading** | Dashboard, Posições, Resíduos, Ordens Limit, Mapa de Calor, Monitor TP/SL |
| **Configuração** | Contas, Cofres, Parâmetros, Webhooks, Monitor Webhook |
| **Relatórios** | Relatórios, Operações, Monitoramento |
| **Assinantes** | (Admin only) Gestão completa de assinantes |
| **Admin** | (Admin only) Painel admin, Usuários, Planos, etc. |

#### Sidebar Colapsável (Desktop)
- Botão para colapsar sidebar em modo ícones
- Tooltips nos ícones quando colapsada
- Persiste o estado da sidebar

```tsx
// Uso automático no layout
import { Sidebar } from '@/components/layout/Sidebar'
```

### Mobile Bottom Navigation

Nova barra de navegação inferior para mobile com 5 itens:

```
[Home] [Posições] [+Novo] [Relatórios] [Menu]
```

- **Botão central destacado**: Ação rápida para criar novo parâmetro
- **Badge de notificação**: Indicador de itens pendentes
- **Safe area**: Suporte a dispositivos com notch

```tsx
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

<MobileBottomNav onMenuClick={() => setIsOpen(!isOpen)} />
```

### Breadcrumbs

Navegação contextual mostrando o caminho atual:

```tsx
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'

// Renderiza: Home > Posições > Detalhes
<Breadcrumbs />
```

---

## 3. Dashboard e Cards

### Arquivos Modificados
- `components/shared/StatsCard.tsx`
- `app/(dashboard)/page.tsx`

### StatsCard Melhorado

#### Variantes Disponíveis

```tsx
import { StatsCard, StatsGrid, StatsCardSkeleton } from '@/components/shared/StatsCard'

// Variante padrão
<StatsCard
    title="Total de Posições"
    value={150}
    description="10 abertas • 140 fechadas"
    icon={Target}
    formatAsCurrency={false}
/>

// Variante gradient (destaque)
<StatsCard
    title="P&L Total"
    value={5432.10}
    icon={TrendingUp}
    trend="up"
    variant="gradient"
/>

// Variante minimal (inline)
<StatsCard
    title="ROI"
    value="+15.5%"
    variant="minimal"
    formatAsCurrency={false}
/>
```

#### Props Disponíveis

| Prop | Tipo | Descrição |
|------|------|-----------|
| `title` | string | Título do card |
| `value` | string \| number | Valor principal |
| `description` | string | Descrição auxiliar |
| `icon` | LucideIcon | Ícone do card |
| `change` | number | Variação percentual |
| `trend` | 'up' \| 'down' \| 'neutral' | Tendência (cor) |
| `variant` | 'default' \| 'gradient' \| 'minimal' | Estilo do card |
| `size` | 'sm' \| 'md' \| 'lg' | Tamanho |
| `formatAsCurrency` | boolean | Formatar como moeda |
| `loading` | boolean | Estado de carregamento |

#### StatsGrid

Grid responsivo para cards:

```tsx
<StatsGrid columns={4}>
    <StatsCard ... />
    <StatsCard ... />
    <StatsCard ... />
    <StatsCard ... />
</StatsGrid>

// Colunas: 1 (mobile) → 2 (sm) → 4 (lg)
```

---

## 4. Tabelas e Listagens

### Arquivos Criados/Modificados
- `components/shared/DataTable.tsx` (modificado)
- `components/shared/ResponsiveFilters.tsx` (novo)
- `components/shared/CardList.tsx` (novo)

### DataTable Melhorada

#### Novas Features

```tsx
import { DataTable, Column, ActionItem } from '@/components/shared/DataTable'

const columns: Column<Position>[] = [
    { 
        key: 'symbol', 
        label: 'Símbolo', 
        sortable: true 
    },
    { 
        key: 'pnl', 
        label: 'P&L', 
        align: 'right',
        render: (item) => <span className={item.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
            ${item.pnl.toFixed(2)}
        </span>
    },
    { 
        key: 'createdAt', 
        label: 'Data',
        hideOnMobile: true  // Oculta em mobile
    },
]

const actions: ActionItem<Position>[] = [
    { label: 'Editar', icon: <Edit />, onClick: (item) => edit(item) },
    { label: 'Excluir', icon: <Trash />, onClick: (item) => delete(item), variant: 'destructive' },
]

<DataTable
    data={positions}
    columns={columns}
    actions={actions}
    pagination
    currentPage={page}
    totalPages={10}
    totalItems={100}
    onPageChange={setPage}
    stickyHeader
    striped
    onRowClick={(item) => router.push(`/positions/${item.id}`)}
/>
```

#### Props Novas

| Prop | Tipo | Descrição |
|------|------|-----------|
| `stickyHeader` | boolean | Header fixo ao scrollar |
| `striped` | boolean | Linhas alternadas |
| `compact` | boolean | Padding reduzido |
| `totalItems` | number | Total para "Mostrando X-Y de Z" |
| `emptyIcon` | ReactNode | Ícone no estado vazio |
| `emptyTitle` | string | Título no estado vazio |
| `rowClassName` | (item) => string | Classe condicional por linha |

### ResponsiveFilters

Filtros adaptáveis: inline no desktop, drawer no mobile.

```tsx
import { ResponsiveFilters, FilterField } from '@/components/shared/ResponsiveFilters'

const [filters, setFilters] = useState({ status: '', symbol: '' })

const activeFilters = [
    filters.status && { id: 'status', label: 'Status', value: filters.status },
    filters.symbol && { id: 'symbol', label: 'Símbolo', value: filters.symbol },
].filter(Boolean)

<ResponsiveFilters
    activeFilters={activeFilters}
    onClearFilter={(id) => setFilters({ ...filters, [id]: '' })}
    onClearAll={() => setFilters({ status: '', symbol: '' })}
>
    <FilterField label="Status">
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
            ...
        </Select>
    </FilterField>
    
    <FilterField label="Símbolo">
        <Input value={filters.symbol} onChange={(e) => setFilters({ ...filters, symbol: e.target.value })} />
    </FilterField>
</ResponsiveFilters>
```

### CardList (Mobile)

Alternativa a tabelas para mobile:

```tsx
import { CardList, EmptyState } from '@/components/shared/CardList'

const fields = [
    { key: 'symbol', label: 'Símbolo', primary: true },
    { key: 'status', label: 'Status', secondary: true },
    { key: 'pnl', label: 'P&L', render: (item) => `$${item.pnl.toFixed(2)}` },
    { key: 'roi', label: 'ROI', render: (item) => `${item.roi}%` },
]

<CardList
    data={positions}
    fields={fields}
    actions={[
        { label: 'Editar', onClick: (item) => edit(item) },
        { label: 'Excluir', onClick: (item) => delete(item), variant: 'destructive' },
    ]}
    onCardClick={(item) => router.push(`/positions/${item.id}`)}
    pagination
    currentPage={page}
    totalPages={10}
    onPageChange={setPage}
/>
```

---

## 5. Formulários e Wizards

### Arquivos Criados/Modificados
- `components/ui/input.tsx` (modificado)
- `components/shared/FormField.tsx` (novo)
- `components/parameters/ParameterWizard.tsx` (modificado)

### Input Melhorado

#### Variantes e Estados

```tsx
import { Input } from '@/components/ui/input'

// Variantes
<Input variant="default" />
<Input variant="ghost" />
<Input variant="filled" />

// Tamanhos
<Input inputSize="sm" />
<Input inputSize="default" />
<Input inputSize="lg" />

// Estados
<Input error />
<Input success />

// Ícones
<Input leftIcon={<Search className="h-4 w-4" />} placeholder="Buscar..." />
<Input rightIcon={<X className="h-4 w-4 cursor-pointer" />} />
```

### FormField

Wrapper para campos com label, erro e descrição:

```tsx
import { FormField, FormSection, FormActions } from '@/components/shared/FormField'

<FormSection title="Dados Básicos" description="Informações principais">
    <FormField
        label="Email"
        required
        tooltip="Seu email será usado para login"
        error={errors.email}
    >
        <Input type="email" {...register('email')} error={!!errors.email} />
    </FormField>

    <FormField
        label="Senha"
        required
        description="Mínimo 8 caracteres"
    >
        <Input type="password" {...register('password')} />
    </FormField>
</FormSection>

<FormActions align="between">
    <Button variant="outline" onClick={onCancel}>Cancelar</Button>
    <Button type="submit" loading={isSubmitting}>Salvar</Button>
</FormActions>
```

### ParameterWizard Redesenhado

- Progress bar visual com ícones
- Steps clicáveis (para voltar)
- Indicadores de conclusão
- Layout responsivo

---

## 6. Páginas Públicas

### Arquivos Modificados
- `app/subscribe/page.tsx`
- `app/subscribe/success/page.tsx`

### Subscribe Page

- Hero section com gradientes e efeitos
- Cards de planos com hover effects
- Toggle mensal/trimestral com badge de desconto
- Indicador de plano popular

### Success Page

- Efeito de confetti na confirmação
- Steps visuais do próximo passo
- Design celebratório

---

## 7. PWA e Mobile

### Arquivos Criados
- `app/offline/page.tsx`
- `components/pwa/UpdatePrompt.tsx`
- `components/pwa/InstallPrompt.tsx`

### Página Offline

Página amigável quando sem conexão:

```tsx
// Automaticamente servida pelo Service Worker
```

### Update Prompt

Notifica usuário sobre atualizações do app:

```tsx
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'

// No layout
<UpdatePrompt />
```

### Install Prompt

Sugere instalação do PWA:

```tsx
import { InstallPrompt } from '@/components/pwa/InstallPrompt'

// No layout
<InstallPrompt />
```

Features:
- Detecta iOS e mostra instruções específicas
- Respeita preferência do usuário (dismiss por 7 dias)
- Não aparece se já instalado

---

## 🎨 CSS Utilities Adicionados

```css
/* Safe area para dispositivos com notch */
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-area-top { padding-top: env(safe-area-inset-top); }

/* Touch targets acessíveis */
@media (pointer: coarse) {
    .touch-target { min-height: 44px; min-width: 44px; }
}

/* Ocultar scrollbar */
.scrollbar-hide { scrollbar-width: none; }

/* Animação de confetti */
.animate-confetti { ... }

/* Background grid pattern */
.bg-grid-white\/5 { ... }
```

---

## 📱 Breakpoints

O design é mobile-first com os seguintes breakpoints:

| Breakpoint | Largura | Comportamento |
|------------|---------|---------------|
| Base | < 640px | Mobile: Bottom nav, cards, drawers |
| `sm` | ≥ 640px | Tablet: 2 colunas, mais controles |
| `md` | ≥ 768px | Tablet landscape: filtros inline |
| `lg` | ≥ 1024px | Desktop: Sidebar fixa, 4 colunas |
| `xl` | ≥ 1280px | Desktop wide: Layouts expandidos |

---

## 🚀 Como Usar

1. **Temas**: O sistema detecta automaticamente. Use `ThemeToggle` para override manual.

2. **Navegação**: `Sidebar` se adapta automaticamente ao tamanho da tela.

3. **Cards**: Use `StatsGrid` + `StatsCard` para dashboards responsivos.

4. **Tabelas**: Use `DataTable` para desktop, `CardList` para mobile.

5. **Formulários**: Use `FormField` para campos com validação visual.

6. **PWA**: Os prompts aparecem automaticamente quando apropriado.

---

## 📝 Changelog

### v2.1.0
- Sistema de temas com detecção automática
- Sidebar com grupos colapsáveis
- Mobile bottom navigation
- StatsCard com variantes
- DataTable melhorada
- ResponsiveFilters
- CardList para mobile
- FormField wrapper
- ParameterWizard redesenhado
- Subscribe pages redesenhadas
- PWA prompts (update/install)
- Página offline

