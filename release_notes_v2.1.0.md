# Release Notes - v2.1.0

**Data:** 18 de Dezembro de 2024

## 🎨 Layout Redesign v2.1

Esta versão traz um redesign completo da interface do usuário, focando em melhor experiência mobile e acessibilidade.

---

## ✨ Novidades

### Sistema de Temas
- **Detecção automática** do tema do sistema operacional
- **Toggle manual** entre Claro, Escuro e Sistema
- Persistência da preferência do usuário

### Navegação Redesenhada
- **Sidebar com grupos colapsáveis**: Trading, Configuração, Relatórios, Admin
- **Sidebar colapsável** em modo ícones (desktop)
- **Mobile Bottom Navigation** com 5 itens principais
- **Breadcrumbs** para navegação contextual

### Dashboard Modernizado
- **StatsCard** com 3 variantes: default, gradient, minimal
- **Grid responsivo** adaptável a qualquer tela
- Indicadores visuais de tendência (up/down)
- Skeleton loading melhorado

### Tabelas Responsivas
- **Filtros adaptáveis**: inline no desktop, drawer no mobile
- **CardList**: visualização alternativa para mobile
- **Header sticky** ao scrollar
- **Ações em dropdown** quando há muitas opções
- Paginação simplificada para mobile

### Formulários Melhorados
- **Input** com variantes (default, ghost, filled)
- **Estados visuais** de erro e sucesso
- **Suporte a ícones** (esquerda/direita)
- **FormField** wrapper com label, tooltip e mensagens

### Wizard Redesenhado
- **Progress bar visual** com ícones por etapa
- **Steps clicáveis** para navegação
- **Indicadores de conclusão**
- Layout responsivo

### Páginas Públicas
- **Subscribe page** com hero animado e cards modernos
- **Success page** com efeito de confetti
- Design celebratório na confirmação de pagamento

### PWA Aprimorado
- **UpdatePrompt**: notifica sobre atualizações disponíveis
- **InstallPrompt**: sugere instalação do app (iOS e Android)
- **Página offline** melhorada
- Suporte a safe areas (dispositivos com notch)

---

## 📦 Pacotes Atualizados

| Pacote | Versão |
|--------|--------|
| @mvcashnode/api | 2.1.0 |
| @mvcashnode/executor | 2.1.0 |
| @mvcashnode/monitors | 2.1.0 |
| @mvcashnode/backup | 2.1.0 |
| @mvcashnode/frontend | 2.1.0 |
| @mvcashnode/db | 2.1.0 |
| @mvcashnode/domain | 2.1.0 |
| @mvcashnode/shared | 2.1.0 |
| @mvcashnode/exchange | 2.1.0 |
| @mvcashnode/notifications | 2.1.0 |

---

## 📁 Novos Arquivos

```
apps/frontend/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MobileBottomNav.tsx
│   │   │   └── Breadcrumbs.tsx
│   │   ├── shared/
│   │   │   ├── ResponsiveFilters.tsx
│   │   │   ├── CardList.tsx
│   │   │   └── FormField.tsx
│   │   ├── pwa/
│   │   │   ├── UpdatePrompt.tsx
│   │   │   └── InstallPrompt.tsx
│   │   └── ui/
│   │       └── sheet.tsx
│   └── app/
│       └── offline/
│           └── page.tsx
├── docs/
│   └── LAYOUT_REDESIGN_V2.1.md
└── CHANGELOG.md
```

---

## 🚀 Comandos para Deploy

### 1. Criar Tag e Push

```bash
# Adicionar todas as mudanças
git add .

# Commit
git commit -m "feat: Layout Redesign v2.1.0

- Sistema de temas com auto-detecção (light/dark/system)
- Sidebar com grupos colapsáveis e modo ícones
- Mobile bottom navigation
- Breadcrumbs para navegação contextual
- StatsCard com variantes (default, gradient, minimal)
- DataTable melhorada com filtros responsivos
- CardList para visualização mobile
- FormField wrapper com validação visual
- ParameterWizard redesenhado
- Subscribe pages com novo design
- PWA prompts (update/install)
- Página offline melhorada
- Documentação completa"

# Criar tag
git tag -a v2.1.0 -m "Release v2.1.0 - Layout Redesign"

# Push com tags
git push origin main --tags
```

### 2. Criar Release no GitHub

```bash
# Via GitHub CLI (se instalado)
gh release create v2.1.0 \
  --title "v2.1.0 - Layout Redesign" \
  --notes-file release_notes_v2.1.0.md

# Ou via interface web:
# https://github.com/SEU_USUARIO/mvcashnode/releases/new
# Tag: v2.1.0
# Title: v2.1.0 - Layout Redesign
# Description: Cole o conteúdo deste arquivo
```

### 3. Deploy no Servidor

```bash
# SSH no servidor
ssh user@servidor

# Navegar para o projeto
cd /opt/mvcashnode

# Pull das mudanças
git pull origin main

# Instalar dependências
pnpm install

# Build de todos os pacotes
pnpm build

# Reiniciar PM2
pm2 reload ecosystem.config.js

# Verificar status
pm2 status
pm2 logs --lines 50
```

---

## 📋 Checklist de Deploy

- [ ] Backup do banco de dados
- [ ] `git pull origin main`
- [ ] `pnpm install`
- [ ] `pnpm build`
- [ ] `pm2 reload ecosystem.config.js`
- [ ] Verificar logs: `pm2 logs --lines 100`
- [ ] Testar funcionalidades principais
- [ ] Verificar tema claro/escuro
- [ ] Testar no mobile
- [ ] Verificar PWA install prompt

---

## 🐛 Problemas Conhecidos

Nenhum problema conhecido nesta versão.

---

## 📞 Suporte

Em caso de problemas, verificar:
1. Logs do PM2: `pm2 logs`
2. Status dos processos: `pm2 status`
3. Memória: `pm2 monit`

---

**Full Changelog**: [v2.0.1...v2.1.0](https://github.com/SEU_USUARIO/mvcashnode/compare/v2.0.1...v2.1.0)

