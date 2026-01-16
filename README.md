# Trading Automation Backend

Sistema de automação de trading para exchanges com suporte a webhooks, execução automática de ordens, gerenciamento de posições, cofres virtuais e modo de simulação.

## Stack Técnica

- **Runtime**: Node.js 22+
- **Gerenciador**: pnpm (monorepo)
- **Framework**: NestJS
- **Banco de Dados**: MySQL 8 (Prisma ORM)
- **Filas**: Redis + BullMQ
- **Exchange**: CCXT (Binance Spot)
- **Notificações**: Evolution API (WhatsApp)
- **Auth**: JWT + 2FA (TOTP)
- **Documentação**: OpenAPI 3.0 (Swagger)

## Estrutura do Monorepo

```
/apps
  /api         -> API HTTP (REST)
  /executor    -> Worker de execução de ordens
  /monitors    -> Jobs agendados (SL/TP, sync, etc)
/packages
  /db          -> Prisma Client e migrations
  /domain      -> Regras de negócio
  /exchange    -> Adapters CCXT
  /notifications -> Cliente WhatsApp
  /shared      -> Utilitários compartilhados
```

## Setup Local

### Pré-requisitos

- Node.js 22+
- pnpm 8+
- MySQL 8+ (instalação local ou serviço gerenciado)
- Redis (instalação local ou serviço gerenciado)
  - **Importante**: Configure o Redis com limite de memória e política de eviction:
    ```bash
    # Via redis.conf:
    maxmemory 512mb
    maxmemory-policy allkeys-lru
    
    # Ou via comando:
    redis-cli CONFIG SET maxmemory 512mb
    redis-cli CONFIG SET maxmemory-policy allkeys-lru
    ```

> **Nota**: Para instruções detalhadas de instalação e configuração, consulte [docs/SETUP.md](docs/SETUP.md)

### Instalação

> **IMPORTANTE - Segurança**: Este projeto usa `ignore-scripts=true` no `.npmrc` para prevenir execução de código malicioso durante a instalação. Isso é uma medida de segurança contra dependências NPM comprometidas.

```bash
# Instalar dependências (scripts são bloqueados automaticamente por segurança)
pnpm install

# Executar pós-instalação segura (gera Prisma Client)
pnpm run postinstall:safe

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Executar migrations
pnpm db:migrate:deploy
```

#### Instalação Manual (Servidores de Produção)

Se preferir controle total sobre a instalação:

```bash
# 1. Limpar instalação anterior (se houver)
rm -rf node_modules apps/*/node_modules packages/*/node_modules

# 2. Instalar sem executar scripts
pnpm install --ignore-scripts

# 3. Reconstruir pacotes nativos (bcrypt precisa compilar binários)
pnpm rebuild bcrypt

# 4. Gerar Prisma Client manualmente
cd packages/db && npx prisma generate && cd ../..

# 5. Compilar o projeto
pnpm build
```

### Desenvolvimento

```bash
# Executar todos os serviços
pnpm dev

# Executar apenas API
pnpm dev:api

# Executar apenas Executor
pnpm dev:executor

# Executar apenas Monitors
pnpm dev:monitors
```

### Scripts Disponíveis

- `pnpm build` - Build de todos os packages
- `pnpm dev` - Executar todos os serviços em modo desenvolvimento
- `pnpm dev:api` - Executar apenas API
- `pnpm dev:executor` - Executar apenas Executor
- `pnpm dev:monitors` - Executar apenas Monitors
- `pnpm start` - Executar todos os serviços em modo produção
- `pnpm test` - Executar todos os testes
- `pnpm lint` - Verificar código
- `pnpm format` - Formatar código
- `pnpm db:generate` - Gerar Prisma Client
- `pnpm db:migrate` - Executar migrations
- `pnpm db:studio` - Abrir Prisma Studio

## Variáveis de Ambiente - Autenticação

- `JWT_EXPIRES_IN`: Tempo de expiração do access token (padrão: 3600s = 1h)
- `JWT_REFRESH_EXPIRES_IN`: Tempo de expiração do refresh token (padrão: 604800s = 7d)

**Nota:** Com "Lembrar de mim" marcado, o access token expira em 7 dias em vez de 1 hora.

## Documentação

- **API**: A documentação completa da API está disponível em `/api-docs` quando a API estiver rodando
- **Setup Local**: Veja [docs/SETUP.md](docs/SETUP.md) para instruções detalhadas de instalação e configuração
- **Documentação Adicional**: Consulte o diretório [docs/](docs/) para mais documentação do projeto

## Segurança

### Scripts de Instalação Bloqueados

Este projeto bloqueia a execução automática de scripts `postinstall`/`preinstall` durante o `pnpm install` como medida de segurança contra dependências NPM comprometidas.

**Por que isso é necessário?**
- Dependências NPM podem ser comprometidas e executar código malicioso durante a instalação
- Crypto miners e outros malwares são frequentemente distribuídos via scripts postinstall
- Bloquear scripts automáticos e executá-los manualmente garante controle total

**O que é executado manualmente?**
- `pnpm run postinstall:safe` - Gera o Prisma Client (único script necessário)

### Limpeza de Servidor Comprometido

Se você suspeitar que o servidor foi comprometido (processos com nomes aleatórios usando 100%+ CPU):

```bash
# 1. Identificar e matar processos suspeitos
ps aux | grep -E "cpu|miner" | grep -v grep
pkill -9 <nome_do_processo>

# 2. Limpar crontabs (malware se reinstala via cron)
crontab -r
cat /etc/crontab

# 3. Verificar arquivos temporários suspeitos
ls -la /tmp/.*
ls -la /var/tmp/.*
ls -la /dev/shm/

# 4. Reinstalar dependências de forma segura
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install --ignore-scripts
pnpm run postinstall:safe
```

## Licença

Proprietary

