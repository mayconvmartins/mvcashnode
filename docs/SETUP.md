# Guia de Setup Local - Trading Automation Backend

Este guia fornece instruções detalhadas para configurar e executar o projeto localmente sem Docker.

## Pré-requisitos

### Software Necessário

- **Node.js 22+**: [Download](https://nodejs.org/)
- **pnpm 8+**: Instalar via `npm install -g pnpm`
- **MySQL 8+**: Instalação local ou serviço gerenciado
- **Redis**: Instalação local ou serviço gerenciado

### Verificação

```bash
# Verificar versões
node --version  # Deve ser >= 22.0.0
pnpm --version  # Deve ser >= 8.0.0
mysql --version # Deve ser >= 8.0.0
redis-cli --version
```

## Instalação de Dependências do Sistema

### Windows

#### MySQL 8

1. Baixar MySQL Installer: https://dev.mysql.com/downloads/installer/
2. Executar o instalador e escolher "Developer Default"
3. Configurar root password durante a instalação
4. Verificar instalação:
   ```bash
   mysql -u root -p
   ```

#### Redis

1. Baixar Redis para Windows: https://github.com/microsoftarchive/redis/releases
   - Ou usar WSL2 com Redis
   - Ou usar Docker apenas para Redis (se preferir)
2. Iniciar Redis:
   ```bash
   redis-server
   ```

### Linux (Ubuntu/Debian)

```bash
# MySQL 8
sudo apt update
sudo apt install mysql-server
sudo mysql_secure_installation

# Redis
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### macOS

```bash
# MySQL 8
brew install mysql@8.0
brew services start mysql@8.0

# Redis
brew install redis
brew services start redis
```

## Configuração do Projeto

### 1. Clonar e Instalar Dependências

```bash
# Instalar dependências do projeto
pnpm install
```

### 2. Configurar Banco de Dados MySQL

**Para MySQL local:**
```bash
# Conectar ao MySQL
mysql -u root -p

# Criar banco de dados
CREATE DATABASE mvcashnode CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Criar usuário (opcional, pode usar root)
CREATE USER 'mvcashnode'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON mvcashnode.* TO 'mvcashnode'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Para MySQL remoto:**
- Use as credenciais fornecidas pelo seu provedor de serviço gerenciado
- Certifique-se de que o servidor permite conexões do seu IP
- Configure o `DATABASE_URL` no `.env` com as credenciais corretas

### 3. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar .env com suas configurações
# Use um editor de texto ou: nano .env
```

**Configurações mínimas necessárias no `.env`:**

**Para MySQL e Redis locais:**
```bash
# Database
DATABASE_URL=mysql://mvcashnode:password@localhost:3306/mvcashnode?schema=public

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Deixe vazio se Redis não tiver senha
```

**Para MySQL e Redis remotos:**
```bash
# Database (serviço gerenciado ou servidor remoto)
DATABASE_URL=mysql://usuario:senha@servidor-remoto.com:3306/mvcashnode?schema=public

# Redis (serviço gerenciado ou servidor remoto)
REDIS_HOST=servidor-redis.com
REDIS_PORT=6379
REDIS_PASSWORD=sua-senha-redis  # Obrigatório para serviços remotos
```

# JWT Secrets (gerar com: openssl rand -base64 32)
JWT_SECRET=your-32-char-min-secret-here
JWT_REFRESH_SECRET=your-32-char-min-secret-here

# Encryption Key (exatamente 32 bytes, gerar com: openssl rand -base64 32 ou node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
# IMPORTANTE: Deve ter pelo menos 32 caracteres!
ENCRYPTION_KEY=your-exactly-32-byte-key-here

# API
API_PORT=4010
NODE_ENV=development
```

### 4. Executar Migrations

```bash
# Gerar Prisma Client
pnpm db:generate

# Executar migrations (desenvolvimento)
pnpm db:migrate

# Para bancos remotos sem permissão de criar shadow database:
# Use migrate deploy (produção) ou adicione --skip-seed ao migrate dev
pnpm db:migrate:deploy
```

**Nota sobre Shadow Database:**
- O Prisma Migrate usa um "shadow database" temporário durante o desenvolvimento
- Se seu banco remoto não permite criar databases, use `db:migrate:deploy` em vez de `db:migrate`
- Ou adicione `shadowDatabaseUrl` no `schema.prisma` apontando para um banco temporário

### 5. Verificar Redis

```bash
# Testar conexão Redis
redis-cli ping
# Deve retornar: PONG
```

## Executando o Projeto

### Desenvolvimento

```bash
# Executar todos os serviços (API, Executor, Monitors)
pnpm dev

# Ou executar individualmente:
pnpm dev:api       # Apenas API (porta 4010)
pnpm dev:executor  # Apenas Executor
pnpm dev:monitors  # Apenas Monitors
```

### Produção

```bash
# Build de todos os packages
pnpm build

# Executar em modo produção
pnpm start
# Ou individualmente:
pnpm start:api
pnpm start:executor
pnpm start:monitors
```

## Verificação

### 1. API

Acesse: http://localhost:4010

- **Swagger UI**: http://localhost:4010/api-docs
- **Health Check**: http://localhost:4010/health (se implementado)

### 2. Logs

Os logs são salvos automaticamente no diretório `/logs`:
- `application-YYYY-MM-DD.log` - Logs gerais
- `error-YYYY-MM-DD.log` - Apenas erros

### 3. Prisma Studio

```bash
# Visualizar dados do banco
pnpm db:studio
# Abre em: http://localhost:5555
```

## Troubleshooting

### MySQL não conecta

- Verificar se MySQL está rodando: `sudo systemctl status mysql` (Linux) ou `brew services list` (macOS)
- Verificar credenciais no `.env`
- Verificar se o banco existe
- Verificar firewall/porta (pode ser não padrão em serviços remotos)
- **Para MySQL remoto**: Verificar se o IP está autorizado no servidor

### Erro de Shadow Database (P3014)

Se você receber erro `P3014` sobre shadow database ao executar `pnpm db:migrate`:

**Opção 1 - Usar migrate deploy (recomendado para produção/banco remoto):**
```bash
pnpm db:migrate:deploy
```

**Opção 2 - Configurar shadow database:**
1. Crie um banco temporário no mesmo servidor
2. Adicione no `.env`:
   ```bash
   SHADOW_DATABASE_URL=mysql://usuario:senha@servidor:porta/shadow_db_temp
   ```
3. Descomente a linha `shadowDatabaseUrl` no `packages/db/prisma/schema.prisma`

### Redis não conecta

- Verificar se Redis está rodando: `redis-cli -h servidor-remoto -p porta -a senha ping` (para remoto)
- Verificar porta no `.env` (pode ser não padrão em serviços remotos)
- Verificar se há senha configurada no Redis e atualizar `REDIS_PASSWORD` no `.env`
- **Para Redis remoto**: Verificar se o IP está autorizado e se há firewall configurado

### Erro de permissões

- Verificar permissões do diretório `/logs` (será criado automaticamente)
- Verificar permissões do MySQL para o usuário configurado

### Porta já em uso

- Verificar se outra aplicação está usando a porta 4010: `lsof -i :4010` (macOS/Linux) ou `netstat -ano | findstr :4010` (Windows)
- Alterar `API_PORT` no `.env` se necessário

## Estrutura de Diretórios

```
mvcashnode/
├── apps/
│   ├── api/          # API HTTP
│   ├── executor/     # Worker de execução
│   └── monitors/     # Jobs agendados
├── packages/
│   ├── db/           # Prisma
│   ├── domain/       # Regras de negócio
│   ├── exchange/     # Adapters CCXT
│   ├── notifications/# WhatsApp
│   └── shared/       # Utilitários
├── docs/             # Documentação
├── logs/             # Logs centralizados
└── .env              # Variáveis de ambiente
```

## Próximos Passos

1. Configurar contas de exchange (via API)
2. Configurar webhooks (via API)
3. Configurar cofres (via API)
4. Consultar documentação da API em `/api-docs` quando a API estiver rodando

## Suporte

Para mais informações, consulte:
- [README.md](../README.md) - Visão geral do projeto
- [docs/](../docs/) - Documentação adicional
- API Docs: http://localhost:4010/api-docs (quando API estiver rodando)

