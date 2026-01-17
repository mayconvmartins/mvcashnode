# Guia de Deploy Seguro - MvCash Node

Este documento descreve os passos para fazer deploy seguro do projeto, prevenindo vulnerabilidades conhecidas como **CVE-2025-55182 (React2Shell)**.

## Vulnerabilidade Corrigida

**CVE-2025-55182** é uma vulnerabilidade crítica de Remote Code Execution (RCE) em Next.js Server Components que permitia atacantes executarem código arbitrário no servidor sem autenticação.

### Sintomas de Infecção
- Processos com nomes estranhos (`Hrb3wZ`, `57hSang`, etc.) consumindo CPU
- Cron jobs em `/etc/cron.d/root`
- Binários maliciosos na raiz (`/Hrb3wZ`)
- Servidor infectado logo após `build + pm2 start`

### Correções Aplicadas
1. **Next.js atualizado** para versão com patch (16.1.0+)
2. **Server Actions restritos** via `allowedOrigins`
3. **Rate limiting** no nginx
4. **Bloqueio de user-agents** suspeitos
5. **Execução como não-root**

## Passos para Deploy Seguro

### 1. Limpar Malware Existente (se infectado)

```bash
# Parar PM2
pm2 stop all
pm2 delete all

# Remover malware
rm -f /etc/cron.d/root /Hrb3wZ /57hSang
pkill -9 -f "Hrb|hSang|xmr|mine"

# Verificar se foi removido
bash scripts/security-monitor.sh
```

### 2. Configurar Usuário Não-Root

**CRÍTICO**: Nunca rode PM2 como root!

```bash
# Executar como root
sudo bash scripts/setup-non-root.sh

# Isso cria o usuário 'mvcash' e configura permissões
```

### 3. Instalar Dependências

```bash
# Como usuário mvcash
su - mvcash
cd /opt/mvcashnode

# Instalar sem executar scripts
pnpm install --ignore-scripts

# Executar scripts seguros manualmente
pnpm run postinstall:safe
```

### 4. Build

```bash
pnpm build
```

### 5. Configurar Nginx

Copie as configurações atualizadas:

```bash
# Como root
cp nginx_config/*.conf /etc/nginx/sites-available/
nginx -t
systemctl reload nginx
```

**IMPORTANTE**: Adicione no `/etc/nginx/nginx.conf` (bloco http):

```nginx
limit_req_zone $binary_remote_addr zone=nextjs:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=nextjs_strict:10m rate=2r/s;
```

### 6. Iniciar PM2

```bash
# Como usuário mvcash
su - mvcash
cd /opt/mvcashnode

pm2 start ecosystem.config.js
pm2 save

# Como root - configurar startup automático
pm2 startup systemd -u mvcash --hp /home/mvcash
```

### 7. Monitorar

```bash
# Monitorar por 10 minutos após o deploy
bash scripts/security-monitor.sh --watch

# Se nenhum processo malicioso aparecer, a correção funcionou!
```

## Configurações de Segurança

### Cloudflare WAF

No painel Cloudflare:
1. Security > WAF > Managed Rules > **Enable**
2. Ativar regras para Node.js/JavaScript
3. Security > Settings > Security Level > **High**
4. Rate Limiting > Create Rule para `/api/*`

### Firewall do Servidor

```bash
# Bloquear acesso direto às portas do Node (apenas nginx acessa)
ufw deny 4010
ufw deny 5010
ufw deny 6010

# Permitir apenas nginx
ufw allow 80
ufw allow 443
ufw allow ssh
ufw enable
```

## Checklist de Segurança

- [ ] Next.js atualizado para 16.1.0+
- [ ] PM2 rodando como usuário `mvcash` (não root)
- [ ] Nginx com rate limiting configurado
- [ ] Cloudflare WAF habilitado
- [ ] Firewall bloqueando portas do Node
- [ ] Monitoramento executado por 10 minutos sem infecção

## Scripts de Segurança

| Script | Descrição |
|--------|-----------|
| `scripts/setup-non-root.sh` | Configura usuário mvcash e permissões |
| `scripts/security-monitor.sh` | Verifica e remove malware |
| `scripts/postinstall-safe.sh` | Executa pós-instalação segura |

## Referências

- [CVE-2025-55182 - Next.js RCE](https://certik.com/resources/blog/react-next-js-cve-2025-55182)
- [pnpm Supply Chain Security](https://pnpm.io/supply-chain-security)
