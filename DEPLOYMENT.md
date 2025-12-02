# Guia de Deploy - Trading Automation Backend

## Configuração do Docker

### Desenvolvimento Local

O `docker-compose.yml` está configurado para desenvolvimento local:

- **MySQL**: Porta `13306` (externa) → `3306` (interna)
- **Redis**: Porta `16379` (externa) → `16379` (interna)
- **API**: Porta `4010` (não exposta no Docker, apenas localmente)

### Produção

O `docker-compose.prod.yml` está configurado para produção:

- **Nenhuma porta exposta externamente** - todos os serviços se comunicam apenas na rede interna
- **API**: Porta `4010` (apenas comunicação interna)
- Use um reverse proxy (nginx/traefik) para expor a API externamente

## Variáveis de Ambiente

### Obrigatórias

```bash
# Database
DATABASE_URL=mysql://user:password@mysql:3306/mvcashnode?schema=public

# Redis
REDIS_HOST=redis
REDIS_PORT=16379
REDIS_PASSWORD=your-secure-password

# JWT
JWT_SECRET=your-32-char-min-secret
JWT_REFRESH_SECRET=your-32-char-min-secret

# Encryption (32 bytes)
ENCRYPTION_KEY=your-exactly-32-byte-key
```

### Opcionais

```bash
# API
API_PORT=4010
NODE_ENV=production

# WhatsApp
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=your-key
EVOLUTION_INSTANCE_NAME=your-instance
```

## Deploy em Produção

### 1. Preparar Ambiente

```bash
# Copiar .env.example para .env
cp .env.example .env

# Editar .env com valores de produção
nano .env
```

### 2. Gerar Chaves Seguras

```bash
# JWT Secrets (mínimo 32 caracteres)
openssl rand -base64 32

# Encryption Key (exatamente 32 bytes)
openssl rand -base64 32
```

### 3. Build e Deploy

```bash
# Build das imagens
docker-compose -f docker-compose.prod.yml build

# Iniciar serviços
docker-compose -f docker-compose.prod.yml up -d

# Verificar logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 4. Executar Migrations

```bash
# Entrar no container da API
docker exec -it mvcashnode_api sh

# Executar migrations
pnpm db:migrate
```

### 5. Reverse Proxy (Nginx)

Exemplo de configuração Nginx:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://mvcashnode_api:4010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoramento

### Health Checks

- **API**: `GET /admin/health`
- **MySQL**: Verificado automaticamente pelo Docker
- **Redis**: Verificado automaticamente pelo Docker

### Logs

```bash
# Todos os serviços
docker-compose logs -f

# Apenas API
docker-compose logs -f api

# Apenas Executor
docker-compose logs -f executor

# Apenas Monitors
docker-compose logs -f monitors
```

## Backup

### MySQL

```bash
# Backup
docker exec mvcashnode_mysql mysqldump -u root -p mvcashnode > backup.sql

# Restore
docker exec -i mvcashnode_mysql mysql -u root -p mvcashnode < backup.sql
```

### Redis

```bash
# Backup
docker exec mvcashnode_redis redis-cli -a $REDIS_PASSWORD SAVE
docker cp mvcashnode_redis:/data/dump.rdb ./redis-backup.rdb
```

## Segurança

1. **Nunca exponha portas diretamente** - use reverse proxy
2. **Use senhas fortes** para MySQL, Redis e JWT
3. **Gere chaves únicas** para cada ambiente
4. **Mantenha .env seguro** - nunca commite no git
5. **Use HTTPS** em produção (via reverse proxy)
6. **Configure firewall** para bloquear acesso direto aos containers

## Troubleshooting

### Container não inicia

```bash
# Verificar logs
docker-compose logs container_name

# Verificar status
docker-compose ps

# Reiniciar container
docker-compose restart container_name
```

### Erro de conexão com banco

```bash
# Verificar se MySQL está rodando
docker-compose ps mysql

# Verificar variáveis de ambiente
docker exec mvcashnode_api env | grep DATABASE
```

### Erro de conexão com Redis

```bash
# Verificar se Redis está rodando
docker-compose ps redis

# Testar conexão
docker exec mvcashnode_redis redis-cli -a $REDIS_PASSWORD ping
```

