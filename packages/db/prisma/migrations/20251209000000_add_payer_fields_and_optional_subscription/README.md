# Migration: Adicionar campos payer e tornar subscription_id opcional

Esta migration adiciona os campos `payer_cpf` e `payer_email` à tabela `subscription_payments` e torna o campo `subscription_id` opcional (nullable).

## Alterações

1. **Torna `subscription_id` opcional**: Permite que pagamentos sejam criados sem assinatura vinculada inicialmente
2. **Adiciona `payer_cpf`**: CPF informado pelo usuário no pagamento (VARCHAR(20) NULL)
3. **Adiciona `payer_email`**: Email informado pelo usuário no pagamento (VARCHAR(255) NULL)
4. **Cria índice em `payer_email`**: Para otimizar buscas por email

## Como aplicar em produção

### Opção 1: Usando Prisma Migrate Deploy (Recomendado)

```bash
cd packages/db
npx prisma migrate deploy
```

### Opção 2: Executar SQL manualmente

Se houver problemas com o nome da constraint, execute primeiro:

```bash
mysql -u seu_usuario -p mvcash < check_constraint.sql
```

Isso mostrará o nome exato da constraint. Se o nome for diferente de `subscription_payments_subscription_id_fkey`, edite o arquivo `migration.sql` e substitua o nome.

Depois execute:

```bash
mysql -u seu_usuario -p mvcash < migration.sql
```

## Notas importantes

- Esta migration é segura e não remove dados existentes
- Todos os campos novos são NULL por padrão
- A foreign key é recriada para permitir NULL em `subscription_id`
- O índice em `payer_email` ajuda nas buscas de pagamentos por email

