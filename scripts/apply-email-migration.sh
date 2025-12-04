#!/bin/bash
# Script para aplicar apenas a migration de email sem resetar o banco
# Use este script se houver problemas com drift no Prisma

echo "Aplicando migration de email diretamente no banco..."
echo "Certifique-se de ter as credenciais do banco configuradas no .env"

# Carrega variáveis do .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Executa o SQL diretamente
if [ -z "$DATABASE_URL" ]; then
    echo "ERRO: DATABASE_URL não encontrada no .env"
    exit 1
fi

# Extrai informações da DATABASE_URL
# Formato: mysql://user:password@host:port/database
DB_URL=$(echo $DATABASE_URL | sed 's|mysql://||')
DB_USER=$(echo $DB_URL | cut -d: -f1)
DB_PASS=$(echo $DB_URL | cut -d: -f2 | cut -d@ -f1)
DB_HOST=$(echo $DB_URL | cut -d@ -f2 | cut -d: -f1)
DB_PORT=$(echo $DB_URL | cut -d: -f3 | cut -d/ -f1)
DB_NAME=$(echo $DB_URL | cut -d/ -f2)

echo "Conectando ao banco: $DB_NAME em $DB_HOST:$DB_PORT"

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < scripts/apply-email-migration.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration aplicada com sucesso!"
    echo "Agora marque a migration como aplicada:"
    echo "pnpm db:migrate:resolve --applied 20251204082141_add_email_notifications"
else
    echo "❌ Erro ao aplicar migration"
    exit 1
fi

