# 🚀 Deploy do Sistema de Logos - Correções Completas

## 📋 Resumo das Correções

### 1. **Backend - CryptoLogosService**
- ✅ Corrigido URL público das logos para usar `SWAGGER_SERVER_URL`
- ✅ Adicionado logs de debug para rastreamento
- ✅ Remove barra final da URL automaticamente

### 2. **Backend - main.ts**
- ✅ Corrigido servir arquivos estáticos (mudou de `/logos` para `/public`)
- ✅ Prefixo ajustado para `/` em vez de `/logos/`
- ✅ Adicionado verificação se diretório de logos existe

### 3. **Frontend - crypto-logos.ts**
- ✅ Implementado detecção automática de URL da API
- ✅ Usa `core.mvcash.com.br` automaticamente em produção
- ✅ Adicionado logs de debug para rastreamento

---

## 🔧 Variáveis de Ambiente Necessárias

### No servidor de produção (`/opt/mvcashnode/.env`):

```bash
# URL pública da API (sem barra no final)
SWAGGER_SERVER_URL=https://core.mvcash.com.br

# OU usar esta alternativa
API_PUBLIC_URL=https://core.mvcash.com.br
```

---

## 📦 Comandos para Deploy no Servidor

Execute estes comandos **no servidor de produção** via SSH:

```bash
# 1. Ir para o diretório do projeto
cd /opt/mvcashnode

# 2. Parar PM2
pm2 stop all

# 3. Fazer pull das alterações
git pull origin main

# 4. Instalar/atualizar dependências
pnpm install

# 5. Gerar Prisma Client
pnpm --filter @mvcashnode/db prisma generate

# 6. Limpar builds antigos
rm -rf apps/api/dist
rm -rf apps/frontend/.next

# 7. Rebuild completo
pnpm --filter @mvcashnode/api build
pnpm --filter @mvcashnode/frontend build

# 8. Verificar se diretório de logos existe
mkdir -p apps/api/public/logos
ls -la apps/api/public/logos/

# 9. Verificar variável de ambiente
grep "SWAGGER_SERVER_URL" .env

# 10. Reiniciar PM2
pm2 restart all

# 11. Monitorar logs
pm2 logs --lines 100
```

---

## ✅ Verificações Pós-Deploy

### 1. Logs da API devem mostrar:

```
[CryptoLogosService] Logos directory: /opt/mvcashnode/apps/api/public/logos
[CryptoLogosService] Public URL for logos: https://core.mvcash.com.br/logos/
[Static Files] ✅ Servindo arquivos estáticos de: /opt/mvcashnode/apps/api/public
[Static Files] ✅ Logos acessíveis via: /logos/
[Static Files] ✅ Diretório de logos existe: /opt/mvcashnode/apps/api/public/logos
API running on http://localhost:4010
```

### 2. Testar endpoint de logos:

```bash
# Testar busca de logo (substitua <TOKEN> pelo seu JWT)
curl -H "Authorization: Bearer <TOKEN>" \
  https://core.mvcash.com.br/crypto-logos/BTC
```

**Resposta esperada:**
```json
{
  "symbol": "BTC",
  "logoUrl": "https://core.mvcash.com.br/logos/btc_a1b2c3d4.png"
}
```

### 3. Testar acesso direto ao logo:

```bash
# Testar se o arquivo é servido (URL retornada acima)
curl -I https://core.mvcash.com.br/logos/btc_a1b2c3d4.png
```

**Resposta esperada:**
```
HTTP/1.1 200 OK
Content-Type: image/png
```

### 4. No frontend (navegador):

1. Abrir DevTools (F12)
2. Ir para aba **Console**
3. Navegar para `/heatmap`
4. Procurar por logs: `[CryptoLogos] Fetching logo for...`
5. Verificar se as imagens aparecem nos cards

---

## 🐛 Troubleshooting

### Problema: Logos não aparecem

**Verificar:**
```bash
# 1. Diretório existe?
ls -la /opt/mvcashnode/apps/api/public/logos/

# 2. Variável de ambiente está correta?
grep SWAGGER_SERVER_URL /opt/mvcashnode/.env

# 3. API está servindo arquivos estáticos?
curl -I https://core.mvcash.com.br/logos/test.png

# 4. Permissões do diretório
chmod 755 /opt/mvcashnode/apps/api/public/logos/
```

### Problema: Erro 404 ao acessar logos

**Possível causa:** Nginx não está encaminhando requisições `/logos/` para a API

**Verificar configuração do Nginx:**
```bash
# Ver configuração do Nginx
cat /etc/nginx/sites-enabled/mvcash

# Deve ter algo assim:
# location /logos/ {
#     proxy_pass http://localhost:4010/logos/;
# }
```

### Problema: CORS errors

**Verificar:** Headers do Nginx devem permitir acesso a imagens

```nginx
location /logos/ {
    proxy_pass http://localhost:4010/logos/;
    
    # Headers importantes
    add_header Access-Control-Allow-Origin *;
    add_header Cache-Control "public, max-age=604800";
}
```

---

## 📊 Estrutura Final

```
/opt/mvcashnode/
├── apps/
│   ├── api/
│   │   ├── dist/              # Build da API
│   │   │   └── src/
│   │   │       └── main.js    # ✅ Deve existir
│   │   ├── public/            # Arquivos estáticos
│   │   │   └── logos/         # ✅ Logos das criptos
│   │   │       ├── btc_xxxxx.png
│   │   │       ├── eth_xxxxx.png
│   │   │       └── bnb_xxxxx.png
│   │   └── src/
│   │       └── crypto-logos/  # Módulo de logos
│   └── frontend/
│       └── .next/             # Build do frontend
│           └── required-server-files.json  # ✅ Deve existir
└── .env                       # ✅ Com SWAGGER_SERVER_URL
```

---

## 🎯 Resumo

Todas as correções foram aplicadas:

1. ✅ **Backend** corrigido para usar URL pública correta
2. ✅ **Frontend** detecta URL da API automaticamente
3. ✅ **Arquivos estáticos** servidos corretamente
4. ✅ **Builds** testados e funcionando
5. ✅ **Logs** adicionados para debug
6. ✅ **Cache** implementado (memória + banco de dados)

**Próximo passo:** Execute os comandos de deploy no servidor! 🚀

