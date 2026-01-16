#!/bin/bash
# ============================================
# Script de Pós-Instalação Seguro
# ============================================
# Este script executa apenas os scripts de pós-instalação
# necessários de forma controlada, após um `pnpm install --ignore-scripts`
#
# USO:
#   ./scripts/postinstall-safe.sh
#   ou
#   pnpm run postinstall:safe
# ============================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Pós-Instalação Segura - mvcashnode${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Verificar se estamos na raiz do projeto
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erro: Execute este script na raiz do projeto${NC}"
    exit 1
fi

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${RED}❌ Erro: node_modules não encontrado. Execute 'pnpm install --ignore-scripts' primeiro${NC}"
    exit 1
fi

# ============================================
# 1. Reconstruir pacotes nativos (bcrypt, etc)
# ============================================
echo -e "${YELLOW}🔧 Reconstruindo pacotes nativos (bcrypt)...${NC}"

# bcrypt precisa ser compilado para a arquitetura atual
pnpm rebuild bcrypt 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Tentando rebuild individual do bcrypt...${NC}"
    cd node_modules/.pnpm/bcrypt@*/node_modules/bcrypt 2>/dev/null && npm run install 2>/dev/null && cd - || true
}
echo -e "${GREEN}✅ Pacotes nativos reconstruídos${NC}"
echo ""

# ============================================
# 2. Gerar Prisma Client
# ============================================
echo -e "${YELLOW}📦 Gerando Prisma Client...${NC}"
cd packages/db

# Gerar Prisma Client
if [ -f "prisma/schema.prisma" ]; then
    npx prisma generate --schema=./prisma/schema.prisma
    echo -e "${GREEN}✅ Prisma Client gerado com sucesso${NC}"
else
    echo -e "${RED}❌ Erro: schema.prisma não encontrado${NC}"
    exit 1
fi

cd ../..

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   ✅ Pós-instalação concluída!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Próximos passos:${NC}"
echo -e "  1. Configure as variáveis de ambiente (.env)"
echo -e "  2. Execute as migrações: pnpm db:migrate:deploy"
echo -e "  3. Compile o projeto: pnpm build"
echo -e "  4. Inicie os serviços: pm2 start ecosystem.config.js"
echo ""
