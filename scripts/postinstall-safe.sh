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
# Método 1: pnpm rebuild (pode não funcionar com ignore-scripts)
if pnpm rebuild bcrypt 2>/dev/null; then
    echo -e "${GREEN}✅ bcrypt reconstruído via pnpm${NC}"
else
    echo -e "${YELLOW}⚠️  pnpm rebuild falhou, tentando método direto...${NC}"
    
    # Método 2: Compilar diretamente no diretório do bcrypt
    BCRYPT_DIR=$(find node_modules/.pnpm -type d -name "bcrypt" -path "*/node_modules/bcrypt" 2>/dev/null | head -1)
    
    if [ -n "$BCRYPT_DIR" ] && [ -d "$BCRYPT_DIR" ]; then
        echo -e "${YELLOW}📁 Encontrado bcrypt em: $BCRYPT_DIR${NC}"
        CURRENT_DIR=$(pwd)
        cd "$BCRYPT_DIR"
        
        # Tentar node-gyp rebuild
        if command -v node-gyp &> /dev/null; then
            echo -e "${YELLOW}🔨 Executando node-gyp rebuild...${NC}"
            node-gyp rebuild 2>&1 || {
                echo -e "${YELLOW}⚠️  node-gyp falhou, tentando npm rebuild...${NC}"
                npm rebuild 2>&1 || true
            }
        else
            echo -e "${YELLOW}🔨 Executando npm rebuild...${NC}"
            npm rebuild 2>&1 || true
        fi
        
        cd "$CURRENT_DIR"
        echo -e "${GREEN}✅ bcrypt recompilado${NC}"
    else
        echo -e "${RED}❌ Diretório do bcrypt não encontrado!${NC}"
        echo -e "${YELLOW}💡 Tente: rm -rf node_modules && pnpm install${NC}"
    fi
fi

# Verificar se o binding existe
BINDING_PATH=$(find node_modules/.pnpm -name "bcrypt_lib.node" 2>/dev/null | head -1)
if [ -n "$BINDING_PATH" ]; then
    echo -e "${GREEN}✅ Binding nativo encontrado: $BINDING_PATH${NC}"
else
    echo -e "${RED}❌ AVISO: bcrypt_lib.node não encontrado!${NC}"
    echo -e "${YELLOW}💡 Execute manualmente:${NC}"
    echo -e "${YELLOW}   cd node_modules/.pnpm/bcrypt@*/node_modules/bcrypt && node-gyp rebuild${NC}"
fi
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
