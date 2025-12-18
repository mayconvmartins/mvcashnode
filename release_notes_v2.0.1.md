# Release Notes - v2.0.1

**Data:** 18 de Dezembro de 2025

---

## 🔐 Passkeys (WebAuthn) - Correções Importantes

### Challenge Storage Persistente
- **Problema:** Erro "Challenge não encontrado ou expirado" ao criar Passkey em ambiente com múltiplos processos (PM2 cluster)
- **Solução:** Migração do armazenamento de challenges de memória (Map) para banco de dados (tabela `passkey_challenges`)
- **Arquivos alterados:**
  - `packages/db/prisma/schema.prisma` - Nova model `PasskeyChallenge`
  - `packages/domain/src/auth/passkey.service.ts` - Uso do banco para challenges

### Challenge Mismatch Fix
- **Problema:** Erro "Unexpected authentication response challenge" quando múltiplos challenges eram gerados
- **Solução:** Extração do challenge diretamente do `clientDataJSON` do response WebAuthn para busca precisa no banco
- **Arquivos alterados:**
  - `packages/domain/src/auth/passkey.service.ts` - Nova função `extractChallengeFromClientDataJSON()`

### Conditional UI (Passkey Autofill)
- **Problema:** Loop infinito de prompts de Passkey no desktop; não iniciava automaticamente após correção
- **Solução:** 
  - Flags de controle para evitar reinício em loop
  - Logs de debug para diagnóstico
  - Melhor tratamento do ciclo de vida do AbortController
- **Arquivos alterados:**
  - `apps/frontend/src/app/login/page.tsx`

### Erro NotAllowedError no Desktop
- **Problema:** Mensagem genérica quando operação de Passkey era bloqueada ou expirava
- **Solução:** Tratamento específico com mensagens claras:
  - Timeout: "A operação expirou. Clique no botão novamente para tentar."
  - Bloqueado: "Nenhuma Passkey encontrada ou a operação foi bloqueada. Use email e senha."
- **Arquivos alterados:**
  - `apps/frontend/src/app/login/page.tsx`

---

## 🔄 Webhook Monitor - Correção de Transação

### Transaction Timeout e FK Violation
- **Problema:** 
  - `Transaction already closed: A commit cannot be executed on an expired transaction`
  - `Foreign key constraint violated: alert_id`
- **Causa:** Snapshots eram criados DENTRO da transação mas usando conexão FORA dela (race condition)
- **Solução:**
  - Snapshots agora são criados APÓS o commit da transação (usando `setImmediate`)
  - Isolation level reduzido de `Serializable` para `ReadCommitted`
  - Timeout reduzido de 30s para 15s (transação mais rápida)
- **Arquivos alterados:**
  - `packages/domain/src/webhooks/webhook-monitor.service.ts`

---

## 📦 Migração de Banco de Dados

Execute antes de fazer deploy:

```bash
pnpm db:migrate:deploy
```

Isso aplicará a migração `20251218170000_add_passkey_challenges` que cria a tabela:

```sql
CREATE TABLE passkey_challenges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  challenge_key VARCHAR(255) UNIQUE NOT NULL,
  challenge TEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_challenge_key (challenge_key),
  INDEX idx_expires_at (expires_at)
);
```

---

## 🚀 Deploy

### Comandos para atualizar no servidor:

```bash
# 1. Parar os serviços
pm2 stop all

# 2. Atualizar código
git pull origin main

# 3. Instalar dependências
pnpm install

# 4. Aplicar migração do banco
pnpm db:migrate:deploy

# 5. Rebuild dos pacotes
pnpm build

# 6. Reiniciar serviços
pm2 reload ecosystem.config.js

# 7. Verificar status
pm2 status
pm2 logs --lines 50
```

---

## 🏷️ Comandos para Tag e Release no GitHub

### Criar e enviar a tag:

```bash
# Criar tag anotada
git tag -a v2.0.1 -m "Release v2.0.1 - Passkey fixes, Webhook transaction fix"

# Enviar tag para o GitHub
git push origin v2.0.1

# Ou enviar todas as tags
git push origin --tags
```

### Criar Release no GitHub (via CLI):

```bash
# Se tiver GitHub CLI instalado (gh)
gh release create v2.0.1 \
  --title "v2.0.1 - Passkey & Webhook Fixes" \
  --notes-file release_notes_v2.0.1.md
```

### Criar Release no GitHub (via Web):
1. Acesse: https://github.com/SEU_USUARIO/mvcashnode/releases/new
2. Tag: `v2.0.1`
3. Título: `v2.0.1 - Passkey & Webhook Fixes`
4. Descrição: Cole o conteúdo deste arquivo
5. Clique em "Publish release"

---

## 📋 Arquivos Modificados

### Backend
- `packages/db/prisma/schema.prisma`
- `packages/db/package.json`
- `packages/domain/src/auth/passkey.service.ts`
- `packages/domain/src/webhooks/webhook-monitor.service.ts`
- `packages/domain/package.json`
- `packages/shared/package.json`
- `packages/exchange/package.json`
- `packages/notifications/package.json`

### Frontend
- `apps/frontend/src/app/login/page.tsx`
- `apps/frontend/package.json`

### Apps
- `apps/api/package.json`
- `apps/executor/package.json`
- `apps/monitors/package.json`
- `apps/backup/package.json`

### Config
- `package.json` (raiz)
- `ecosystem.config.js`

---

## ⚠️ Breaking Changes

Nenhum breaking change nesta versão.

---

## 🐛 Bugs Conhecidos Corrigidos

| ID | Descrição | Status |
|----|-----------|--------|
| #1 | Challenge não encontrado ao criar Passkey (PM2 cluster) | ✅ Corrigido |
| #2 | Challenge mismatch na autenticação Passkey | ✅ Corrigido |
| #3 | Loop infinito de prompt Passkey no desktop | ✅ Corrigido |
| #4 | Mensagem genérica em erro de Passkey | ✅ Corrigido |
| #5 | Transaction timeout no Webhook Monitor | ✅ Corrigido |
| #6 | FK violation ao criar snapshot de alerta | ✅ Corrigido |

