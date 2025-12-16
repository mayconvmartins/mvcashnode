#!/bin/bash

echo "================================"
echo "🔍 DIAGNÓSTICO DE LOGOS"
echo "================================"
echo ""

echo "1. Verificando arquivos de logos salvos:"
ls -lh /opt/mvcashnode/apps/api/public/logos/ | head -15
echo ""

echo "2. Verificando migration no banco:"
mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" "$DB_NAME" -e "SHOW TABLES LIKE 'crypto_symbols';"
echo ""

echo "3. Verificando dados no banco:"
mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" "$DB_NAME" -e "SELECT symbol, coingecko_id, logo_local_path, last_updated FROM crypto_symbols LIMIT 5;"
echo ""

echo "4. Verificando logs da API (últimas 30 linhas):"
pm2 logs mvcashnode-api --lines 30 --nostream | grep -i "logo\|static"
echo ""

echo "5. Testando se API serve arquivo localmente:"
curl -I http://localhost:4010/logos/btc_4b9169eb.png
echo ""

echo "6. Verificando configuração Nginx:"
echo "Procurando por configuração de /logos/ no Nginx:"
grep -r "logos" /etc/nginx/sites-enabled/ 2>/dev/null || echo "Nenhuma configuração específica de /logos/ encontrada"
echo ""

echo "7. Testando acesso público (via Nginx):"
curl -I https://core.mvcash.com.br/logos/btc_4b9169eb.png
echo ""

echo "================================"
echo "✅ Diagnóstico completo!"
echo "================================"

