# MVCash Site Público

Site público independente do MVCash, rodando na porta 6010.

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

4. Build para produção:
```bash
pnpm build
pnpm start
```

## Porta

Este módulo roda na porta **6010** e é servido pelo domínio `mvcash.com.br`.

