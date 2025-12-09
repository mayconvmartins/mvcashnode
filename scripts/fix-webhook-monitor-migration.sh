#!/bin/bash
# Script para corrigir a migration falhada de webhook monitor
# Use este script se a migration falhou mas precisa ser aplicada

echo "🔍 Verificando estado da migration de webhook monitor..."

# Carrega variáveis do .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Executa o SQL de verificação
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
echo ""

# Verifica estado
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < scripts/fix-webhook-monitor-migration.sql

echo ""
echo "📋 Opções para resolver:"
echo ""
echo "1. Se a migration NÃO foi aplicada (tabelas não existem):"
echo "   Execute: pnpm db:migrate:resolve --rolled-back 20250220000000_add_webhook_monitor"
echo ""
echo "2. Se a migration foi aplicada PARCIALMENTE:"
echo "   - Verifique quais partes foram aplicadas acima"
echo "   - Aplique manualmente as partes faltantes"
echo "   - Execute: pnpm db:migrate:resolve --applied 20250220000000_add_webhook_monitor"
echo ""
echo "3. Se a migration foi aplicada COMPLETAMENTE mas está marcada como falhada:"
echo "   Execute: pnpm db:migrate:resolve --applied 20250220000000_add_webhook_monitor"

