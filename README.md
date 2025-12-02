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
- MySQL 8+
- Redis

### Instalação

```bash
# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Executar migrations
pnpm db:migrate

# Gerar Prisma Client
pnpm db:generate
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
- `pnpm docker:up` - Iniciar serviços Docker (MySQL, Redis)
- `pnpm docker:down` - Parar serviços Docker
- `pnpm docker:logs` - Ver logs dos serviços Docker

## Documentação

A documentação completa da API está disponível em `/api-docs` quando a API estiver rodando.

## Licença

Proprietary

