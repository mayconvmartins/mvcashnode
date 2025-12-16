# 🔧 SOLUÇÃO COMPLETA: Logos não carregam no frontend

## 🎯 Problema Identificado

As logos estão salvas corretamente em `/opt/mvcashnode/apps/api/public/logos/`, mas não carregam no frontend.

**Causa mais provável:** Nginx não está configurado para servir ou fazer proxy dos arquivos `/logos/`

---

## ✅ SOLUÇÃO RÁPIDA (Recomendada)

### Passo 1: Configurar Nginx

```bash
# 1. Editar configuração do Nginx
sudo nano /etc/nginx/sites-enabled/mvcash

# 2. Dentro do bloco server {} de core.mvcash.com.br, adicione:

    location /logos/ {
        alias /opt/mvcashnode/apps/api/public/logos/;
        
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        
        types {
            image/png png;
            image/jpeg jpg jpeg;
            image/webp webp;
            image/svg+xml svg;
        }
        
        access_log off;
        try_files $uri =404;
    }

# 3. Salvar (Ctrl+O, Enter, Ctrl+X)

# 4. Testar configuração
sudo nginx -t

# 5. Recarregar Nginx
sudo systemctl reload nginx

# 6. Testar acesso
curl -I https://core.mvcash.com.br/logos/btc_4b9169eb.png
```

**Resultado esperado:**
```
HTTP/1.1 200 OK
Content-Type: image/png
Cache-Control: public, max-age=604800, immutable
```

---

## 🔍 DIAGNÓSTICO

Execute estes comandos **no servidor** para identificar o problema:

### 1. Verificar se migration foi aplicada:

```bash
cd /opt/mvcashnode
echo "SELECT COUNT(*) as total FROM crypto_symbols;" | mysql -u root -p mvcash
```

**Se retornar erro "Table doesn't exist":**
```bash
# Aplicar migration
cd /opt/mvcashnode
pnpm --filter @mvcashnode/db prisma migrate deploy
```

### 2. Verificar dados no banco:

```bash
echo "SELECT symbol, logo_local_path, last_updated FROM crypto_symbols LIMIT 5;" | mysql -u root -p mvcash
```

**Resultado esperado:**
```
+--------+---------------------------+---------------------+
| symbol | logo_local_path           | last_updated        |
+--------+---------------------------+---------------------+
| BTC    | /logos/btc_4b9169eb.png   | 2024-12-16 19:15:00 |
| ETH    | /logos/eth_f8d2e158.png   | 2024-12-16 19:15:00 |
+--------+---------------------------+---------------------+
```

### 3. Testar se API serve o arquivo localmente:

```bash
curl -I http://localhost:4010/logos/btc_4b9169eb.png
```

**Resultado esperado:**
```
HTTP/1.1 200 OK
Content-Type: image/png
```

**Se retornar 404:** A API não está servindo os arquivos corretamente. Execute:
```bash
# Reiniciar API
pm2 restart mvcashnode-api

# Ver logs
pm2 logs mvcashnode-api --lines 50 | grep -i "static"
```

### 4. Testar endpoint da API:

```bash
# Primeiro, pegue um token JWT válido:
# Vá no frontend > F12 > Application > Local Storage > accessToken

# Teste o endpoint (substitua SEU_TOKEN):
curl -H "Authorization: Bearer SEU_TOKEN" \
  http://localhost:4010/crypto-logos/BTC
```

**Resultado esperado:**
```json
{
  "symbol": "BTC",
  "logoUrl": "https://core.mvcash.com.br/logos/btc_4b9169eb.png"
}
```

### 5. Testar acesso público via Nginx:

```bash
curl -I https://core.mvcash.com.br/logos/btc_4b9169eb.png
```

**Se retornar 404:** Nginx não está configurado. Volte ao **Passo 1** acima.

---

## 🎯 TESTE FINAL NO FRONTEND

Após configurar o Nginx:

1. Abrir o frontend: https://mvcash.com.br/heatmap
2. Abrir DevTools (F12) > Console
3. Procurar por logs: `[CryptoLogos] Fetching logo for...`
4. Verificar se as imagens carregam nos cards

**Se ainda não carregar:**

Limpe o cache e recarregue:
```javascript
// No console do navegador
localStorage.removeItem('logoCache');
location.reload();
```

---

## 📋 CHECKLIST DE VERIFICAÇÃO

- [ ] Arquivos existem em `/opt/mvcashnode/apps/api/public/logos/`
- [ ] Permissões corretas: `chmod 755 /opt/mvcashnode/apps/api/public/logos/`
- [ ] Migration aplicada no banco: tabela `crypto_symbols` existe
- [ ] Dados no banco: registros com `logo_local_path` preenchido
- [ ] API servindo arquivos: `curl -I http://localhost:4010/logos/btc_4b9169eb.png` retorna 200
- [ ] Nginx configurado: bloco `location /logos/` existe
- [ ] Nginx recarregado: `sudo systemctl reload nginx`
- [ ] Acesso público funcionando: `curl -I https://core.mvcash.com.br/logos/btc_4b9169eb.png` retorna 200
- [ ] Frontend carregando imagens

---

## 🚨 TROUBLESHOOTING

### Erro: "Table 'crypto_symbols' doesn't exist"

```bash
cd /opt/mvcashnode
pnpm --filter @mvcashnode/db prisma migrate deploy
pm2 restart all
```

### Erro: "Permission denied" ao acessar logos

```bash
sudo chmod 755 /opt/mvcashnode/apps/api/public/logos/
sudo chmod 644 /opt/mvcashnode/apps/api/public/logos/*
```

### Nginx retorna 404

Verifique se o `alias` está correto e se o diretório existe:
```bash
ls -la /opt/mvcashnode/apps/api/public/logos/
```

### API não inicia

```bash
# Ver logs
pm2 logs mvcashnode-api --lines 100

# Rebuild
cd /opt/mvcashnode
pnpm --filter @mvcashnode/api build
pm2 restart mvcashnode-api
```

---

## 📝 RESUMO

**O problema principal é que o Nginx NÃO está configurado para servir os arquivos em `/logos/`.**

**Solução:** Adicionar o bloco `location /logos/` no Nginx e recarregar.

**Tempo estimado:** 2 minutos

**Comandos principais:**
```bash
sudo nano /etc/nginx/sites-enabled/mvcash  # Adicionar config
sudo nginx -t                               # Testar
sudo systemctl reload nginx                 # Recarregar
curl -I https://core.mvcash.com.br/logos/btc_4b9169eb.png  # Verificar
```

🎉 **Pronto!** As logos devem aparecer no frontend!

