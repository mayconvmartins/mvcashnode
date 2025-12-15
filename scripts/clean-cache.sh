#!/bin/bash

# Script para limpar cache e otimizar builds
# Útil quando builds estão lentos ou com problemas

echo "🧹 Limpando cache e otimizando builds..."
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Limpar dist folders
echo "${YELLOW}📦 Limpando arquivos compilados (dist/)...${NC}"
find . -name "dist" -type d -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
echo "${GREEN}✓ Dist folders removidos${NC}"
echo ""

# 2. Limpar tsbuildinfo
echo "${YELLOW}📝 Limpando arquivos .tsbuildinfo...${NC}"
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete
echo "${GREEN}✓ .tsbuildinfo removidos${NC}"
echo ""

# 3. Limpar .next do Next.js
echo "${YELLOW}⚛️  Limpando cache do Next.js (.next/)...${NC}"
rm -rf apps/frontend/.next
rm -rf apps/site/.next
echo "${GREEN}✓ Cache do Next.js removido${NC}"
echo ""

# 4. Limpar lock files do Next.js
echo "${YELLOW}🔓 Removendo lock files do Next.js...${NC}"
find . -path "*/.next/lock" -delete 2>/dev/null || true
echo "${GREEN}✓ Lock files removidos${NC}"
echo ""

# 5. Opcional: Limpar cache do PNPM
read -p "Limpar cache do PNPM? Isso pode fazer o próximo build demorar mais. (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "${YELLOW}📦 Limpando cache do PNPM...${NC}"
    pnpm store prune
    echo "${GREEN}✓ Cache do PNPM limpo${NC}"
    echo ""
fi

# 6. Opcional: Remover node_modules
read -p "Remover todos os node_modules? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "${YELLOW}🗑️  Removendo node_modules...${NC}"
    find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
    echo "${GREEN}✓ node_modules removidos${NC}"
    echo ""
    
    echo "${YELLOW}📦 Reinstalando dependências...${NC}"
    pnpm install
    echo "${GREEN}✓ Dependências reinstaladas${NC}"
    echo ""
fi

echo ""
echo "${GREEN}✨ Limpeza concluída!${NC}"
echo ""
echo "Próximos passos:"
echo "  1. Execute: ${YELLOW}pnpm build${NC} (build paralelo otimizado)"
echo "  2. Ou: ${YELLOW}pnpm build:fast${NC} (mais rápido, experimental)"
echo ""

