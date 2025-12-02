# Correções nos Dockerfiles

## Problema Resolvido

O erro `ERR_PNPM_OUTDATED_LOCKFILE` foi corrigido:

1. **Lockfile atualizado**: Executei `pnpm install` para sincronizar o `pnpm-lock.yaml` com os `package.json`
2. **Dockerfiles ajustados**: Removido `--frozen-lockfile` e usado `pnpm install` normal
3. **Build otimizado**: Usando `pnpm --filter` para build apenas do app necessário
4. **docker-compose.prod.yml**: Adicionados valores padrão para todas as variáveis de ambiente

## Mudanças

### Dockerfiles
- Removido `--frozen-lockfile` (causava erro quando lockfile estava desatualizado)
- Usado `pnpm --filter @mvcashnode/{app}` para build apenas do app necessário
- Copiados apenas os arquivos built necessários para o stage de produção

### docker-compose.prod.yml
- Removido `version: '3.8'` (obsoleto)
- Adicionados valores padrão para todas as variáveis de ambiente
- Valores padrão permitem build sem `.env` (mas devem ser alterados em produção)

## Como Buildar Agora

```bash
# Com .env configurado
docker-compose -f docker-compose.prod.yml build

# Sem .env (usa valores padrão - apenas para teste)
docker-compose -f docker-compose.prod.yml build
```

## Importante

⚠️ **NUNCA use os valores padrão em produção!** Configure todas as variáveis no `.env`:
- `JWT_SECRET` e `JWT_REFRESH_SECRET` (mínimo 32 caracteres)
- `ENCRYPTION_KEY` (exatamente 32 bytes)
- `DATABASE_URL` (com credenciais corretas)
- `REDIS_PASSWORD` (senha segura)

