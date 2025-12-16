# MVCash Site Público

Site público independente do MVCash, servido estaticamente pelo nginx.

## Estrutura

- `/` - Landing page
- `/help` - Central de ajuda
- `/help/[slug]` - Manuais individuais

## Configuração

1. Instalar dependências:
```bash
pnpm install
```

2. Configurar variáveis de ambiente:
```bash
cp .env.example .env
# Editar .env e configurar NEXT_PUBLIC_API_URL
```

3. Executar em desenvolvimento:
```bash
pnpm dev
```

## Build Estático para Produção

O site é exportado como estático e servido pelo nginx (não precisa de Node.js rodando).

### Build:

```bash
cd apps/site
pnpm build
```

Isso gera a pasta `out/` com todos os arquivos estáticos (HTML, CSS, JS).

### Deploy no Nginx:

1. **Copiar arquivos para o nginx:**
```bash
sudo cp -r apps/site/out/* /var/www/mvcash/
# ou outro diretório configurado no nginx
```

2. **Configuração Nginx (exemplo):**
```nginx
server {
    listen 80;
    server_name mvcash.com.br www.mvcash.com.br;
    
    root /var/www/mvcash;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;
    
    # Cache para assets estáticos
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Try files para rotas do Next.js
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
    
    # 404 customizado
    error_page 404 /404.html;
}
```

3. **Recarregar nginx:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Benefícios do Deploy Estático

- ✅ **Zero CPU** - não precisa de processo Node.js
- ✅ **Zero RAM** - apenas arquivos estáticos
- ✅ **Mais rápido** - nginx serve arquivos estáticos muito mais rápido
- ✅ **Mais seguro** - sem processo Node.js exposto
- ✅ **Menos complexidade** - não precisa de PM2

## Nota

O site não roda mais no PM2. Foi removido do `ecosystem.config.js` porque agora é servido estaticamente pelo nginx.

