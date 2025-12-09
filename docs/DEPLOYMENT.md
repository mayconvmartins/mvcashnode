# Deploy e Produção

Este documento descreve o processo de deploy e configuração do sistema em ambiente de produção.

## Requisitos de Produção

### Servidor

- **Sistema Operacional**: Linux (Ubuntu 22.04+ recomendado) ou Windows Server
- **CPU**: Mínimo 2 cores, recomendado 4+ cores
- **RAM**: Mínimo 4GB, recomendado 8GB+
- **Disco**: Mínimo 20GB livre (SSD recomendado)
- **Rede**: Conexão estável com internet

### Software

- **Node.js**: 22.0.0 ou superior
- **pnpm**: 8.0.0 ou superior
- **MySQL**: 8.0 ou superior (pode ser serviço gerenciado)
- **Redis**: 6.0 ou superior (pode ser serviço gerenciado)
- **PM2** (recomendado): Para gerenciar processos Node.js

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com todas as variáveis necessárias:

```bash
# Database
DATABASE_URL=mysql://usuario:senha@servidor:3306/mvcashnode?schema=public

# Redis
REDIS_HOST=servidor-redis.com
REDIS_PORT=6379
REDIS_PASSWORD=sua-senha-redis

# JWT Secrets (gerar com: openssl rand -base64 32)
JWT_SECRET=seu-jwt-secret-aqui-minimo-32-caracteres
JWT_REFRESH_SECRET=seu-refresh-secret-aqui-minimo-32-caracteres

# Encryption Key (exatamente 32 bytes, gerar com: openssl rand -base64 32)
ENCRYPTION_KEY=sua-chave-de-criptografia-32-bytes

# API
API_PORT=4010
NODE_ENV=production

# Swagger/OpenAPI
SWAGGER_SERVER_URL=https://core.mvcash.com.br
SWAGGER_SERVER_DESCRIPTION=Produção

# CORS (produção)
CORS_DISABLED=false
CORS_ORIGIN=https://seu-dominio.com,https://www.seu-dominio.com

# NTP e Timezone
TIMEZONE=America/Sao_Paulo
NTP_SERVER=pool.ntp.org
NTP_SYNC_INTERVAL=3600000
NTP_ENABLED=true

# WhatsApp (Evolution API) - Opcional
WHATSAPP_API_URL=http://localhost:8080
WHATSAPP_API_KEY=sua-api-key
WHATSAPP_INSTANCE_NAME=trading-bot
```

### Gerando Secrets

```bash
# JWT Secret
openssl rand -base64 32

# Encryption Key
openssl rand -base64 32
```

## Processo de Deploy

### 1. Preparar Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar pnpm
npm install -g pnpm@8.15.0

# Instalar PM2
npm install -g pm2
```

### 2. Clonar e Configurar Projeto

```bash
# Clonar repositório
git clone <seu-repositorio> mvcashnode
cd mvcashnode

# Instalar dependências
pnpm install

# Criar arquivo .env
cp .env.example .env
# Editar .env com suas configurações
nano .env
```

### 3. Configurar Banco de Dados

```bash
# Executar migrations
pnpm db:migrate:deploy

# Gerar Prisma Client
pnpm db:generate
```

### 4. Build do Projeto

```bash
# Build de todos os packages
pnpm build
```

### 5. Iniciar Serviços com PM2

Crie um arquivo `ecosystem.config.js` na raiz:

```javascript
module.exports = {
  apps: [
    {
      name: 'mvcashnode-api',
      script: './apps/api/dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'mvcashnode-executor',
      script: './apps/executor/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/executor-error.log',
      out_file: './logs/executor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'mvcashnode-monitors',
      script: './apps/monitors/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/monitors-error.log',
      out_file: './logs/monitors-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'mvcashnode-frontend',
      script: 'pnpm',
      args: 'exec next start -p 5010',
      cwd: './apps/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '5010',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
```

Iniciar serviços:

```bash
# Iniciar todos os serviços
pm2 start ecosystem.config.js

# Salvar configuração do PM2
pm2 save

# Configurar PM2 para iniciar no boot
pm2 startup
```

### 6. Configurar Nginx (Recomendado)

Crie um arquivo `/etc/nginx/sites-available/mvcashnode`:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    # Redirecionar HTTP para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Configurações SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Configuração específica para WebSocket (path /ws)
    location /ws {
        proxy_pass http://localhost:4010;
        proxy_http_version 1.1;
        
        # Headers obrigatórios para WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Headers padrão do proxy
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts aumentados para WebSocket (conexões longas)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        
        # Desabilitar cache para WebSocket
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
    }

    # Proxy para API (rotas HTTP normais)
    location / {
        proxy_pass http://localhost:4010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Importante para WebSocket:**
- O path `/ws` é obrigatório e deve estar configurado separadamente
- Os headers `Upgrade` e `Connection` são essenciais para o upgrade HTTP → WebSocket
- Timeouts aumentados (`proxy_read_timeout` e `proxy_send_timeout`) são necessários para conexões WebSocket longas
- `proxy_buffering off` garante que mensagens WebSocket sejam enviadas imediatamente

Ativar configuração:

```bash
sudo ln -s /etc/nginx/sites-available/mvcashnode /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoramento em Produção

### PM2

```bash
# Ver status dos processos
pm2 status

# Ver logs
pm2 logs

# Ver logs de um serviço específico
pm2 logs mvcashnode-api

# Reiniciar serviço
pm2 restart mvcashnode-api

# Parar serviço
pm2 stop mvcashnode-api

# Ver métricas
pm2 monit
```

### Logs

Os logs são salvos em:
- `/logs/application-YYYY-MM-DD.log` - Logs gerais
- `/logs/error-YYYY-MM-DD.log` - Apenas erros
- Logs do PM2: `~/.pm2/logs/`

### Health Checks

Configure um monitoramento externo para verificar:
- `GET /health` - Health check da API
- `GET /admin/health` - Health check completo (requer admin)

### Alertas

Configure alertas para:
- Processos PM2 parados
- Erros recorrentes nos logs
- Uso alto de CPU/memória
- Banco de dados desconectado
- Redis desconectado

## Backup e Recuperação

### Backup do Banco de Dados

```bash
# Backup completo
mysqldump -u usuario -p mvcashnode > backup-$(date +%Y%m%d-%H%M%S).sql

# Backup apenas schema
mysqldump -u usuario -p --no-data mvcashnode > schema-$(date +%Y%m%d).sql

# Backup apenas dados
mysqldump -u usuario -p --no-create-info mvcashnode > data-$(date +%Y%m%d).sql
```

### Script de Backup Automatizado

Crie um script `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/mvcashnode"
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p $BACKUP_DIR

# Backup do banco
mysqldump -u usuario -p'senha' mvcashnode > $BACKUP_DIR/db-$DATE.sql

# Compactar
gzip $BACKUP_DIR/db-$DATE.sql

# Manter apenas últimos 30 dias
find $BACKUP_DIR -name "db-*.sql.gz" -mtime +30 -delete
```

Agendar com cron:

```bash
# Editar crontab
crontab -e

# Adicionar linha (backup diário às 2h da manhã)
0 2 * * * /path/to/backup.sh
```

### Restauração

```bash
# Descompactar backup
gunzip backup-20250212-020000.sql.gz

# Restaurar banco
mysql -u usuario -p mvcashnode < backup-20250212-020000.sql
```

## Atualizações

### Processo de Atualização

```bash
# 1. Fazer backup
./backup.sh

# 2. Parar serviços
pm2 stop all

# 3. Atualizar código
git pull origin main

# 4. Instalar dependências
pnpm install

# 5. Executar novas migrations
pnpm db:migrate:deploy

# 6. Gerar Prisma Client
pnpm db:generate

# 7. Build
pnpm build

# 8. Reiniciar serviços
pm2 restart all

# 9. Verificar logs
pm2 logs
```

## Segurança

### Firewall

```bash
# Permitir apenas portas necessárias
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### SSL/TLS

Use certificados SSL válidos (Let's Encrypt recomendado):

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d seu-dominio.com
```

### Segurança do Banco de Dados

- Use senhas fortes
- Limite acesso por IP quando possível
- Não exponha o banco publicamente
- Use conexões SSL quando disponível

### Segurança da API

- Use HTTPS em produção
- Configure CORS adequadamente
- Mantenha secrets seguros (não commite `.env`)
- Use rate limiting quando necessário
- Monitore tentativas de acesso não autorizado

## Troubleshooting

### Serviço não inicia

```bash
# Ver logs
pm2 logs mvcashnode-api

# Verificar variáveis de ambiente
pm2 env mvcashnode-api

# Verificar se porta está em uso
sudo lsof -i :4010
```

### Banco de dados não conecta

```bash
# Testar conexão
mysql -u usuario -p -h servidor mvcashnode

# Verificar variável DATABASE_URL
echo $DATABASE_URL
```

### Redis não conecta

```bash
# Testar conexão
redis-cli -h servidor -p 6379 -a senha ping

# Verificar variáveis
echo $REDIS_HOST
echo $REDIS_PORT
```

### Alto uso de memória

```bash
# Ver uso de memória
pm2 monit

# Reiniciar serviço
pm2 restart mvcashnode-api
```

## Escalabilidade

### Horizontal Scaling

Para escalar horizontalmente:

1. **API**: Execute múltiplas instâncias atrás de um load balancer
2. **Executor**: Execute múltiplos workers (BullMQ distribui jobs automaticamente)
3. **Monitors**: Apenas uma instância (jobs repetitivos)

### Vertical Scaling

Para melhorar performance:

1. Aumente recursos do servidor (CPU, RAM)
2. Use cache Redis para reduzir carga no banco
3. Otimize queries do banco de dados
4. Use índices adequados

---

**Última atualização**: 2025-02-20

