#!/bin/bash
# =============================================================================
# Script de Configuração para Rodar PM2 como Usuário Não-Root
# =============================================================================
# 
# SEGURANÇA: Vulnerabilidades como CVE-2025-55182 (React2Shell) permitem RCE
# via Next.js Server Components. Se o PM2 rodar como root, o atacante ganha
# acesso total ao sistema.
#
# Este script:
# 1. Cria o usuário 'mvcash' (se não existir)
# 2. Configura permissões corretas em /opt/mvcashnode
# 3. Configura PM2 para iniciar automaticamente como 'mvcash'
#
# Uso: sudo bash scripts/setup-non-root.sh
# =============================================================================

set -e

MVCASH_USER="mvcash"
MVCASH_HOME="/home/$MVCASH_USER"
APP_DIR="/opt/mvcashnode"

echo "=============================================="
echo " Configuração de Segurança - Usuário Não-Root"
echo "=============================================="

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Este script deve ser executado como root (sudo)"
    exit 1
fi

# 1. Criar usuário mvcash (se não existir)
echo ""
echo "1. Verificando usuário '$MVCASH_USER'..."
if id "$MVCASH_USER" &>/dev/null; then
    echo "   ✅ Usuário '$MVCASH_USER' já existe"
else
    echo "   📝 Criando usuário '$MVCASH_USER'..."
    useradd -m -s /bin/bash "$MVCASH_USER"
    echo "   ✅ Usuário '$MVCASH_USER' criado"
fi

# 2. Configurar permissões do diretório da aplicação
echo ""
echo "2. Configurando permissões em $APP_DIR..."
if [ -d "$APP_DIR" ]; then
    chown -R "$MVCASH_USER:$MVCASH_USER" "$APP_DIR"
    echo "   ✅ Permissões configuradas"
else
    echo "   ⚠️  Diretório $APP_DIR não existe"
    echo "   📝 Criando diretório..."
    mkdir -p "$APP_DIR"
    chown -R "$MVCASH_USER:$MVCASH_USER" "$APP_DIR"
    echo "   ✅ Diretório criado e permissões configuradas"
fi

# 3. Criar diretório de logs se não existir
echo ""
echo "3. Configurando diretório de logs..."
LOG_DIR="$APP_DIR/logs"
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
fi
chown -R "$MVCASH_USER:$MVCASH_USER" "$LOG_DIR"
chmod 755 "$LOG_DIR"
echo "   ✅ Diretório de logs configurado"

# 4. Instalar Node.js para o usuário mvcash (via nvm)
echo ""
echo "4. Verificando Node.js para '$MVCASH_USER'..."
if su - "$MVCASH_USER" -c "which node" &>/dev/null; then
    NODE_VERSION=$(su - "$MVCASH_USER" -c "node --version")
    echo "   ✅ Node.js $NODE_VERSION já instalado"
else
    echo "   ⚠️  Node.js não encontrado para '$MVCASH_USER'"
    echo "   📝 Instale o Node.js manualmente:"
    echo ""
    echo "   su - $MVCASH_USER"
    echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "   source ~/.bashrc"
    echo "   nvm install 20"
    echo "   npm install -g pnpm pm2"
    echo ""
fi

# 5. Parar PM2 atual (se estiver rodando como root)
echo ""
echo "5. Parando PM2 atual (se existir)..."
if command -v pm2 &>/dev/null; then
    pm2 kill 2>/dev/null || true
    echo "   ✅ PM2 parado"
else
    echo "   ⏭️  PM2 não encontrado no root"
fi

# 6. Configurar PM2 startup para o usuário mvcash
echo ""
echo "6. Configurando PM2 startup..."
echo "   📝 Execute os comandos abaixo manualmente:"
echo ""
echo "   # Como usuário mvcash:"
echo "   su - $MVCASH_USER"
echo "   cd $APP_DIR"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "   # Como root (para startup automático):"
echo "   pm2 startup systemd -u $MVCASH_USER --hp $MVCASH_HOME"
echo ""

# 7. Resumo
echo "=============================================="
echo " ✅ Configuração Concluída!"
echo "=============================================="
echo ""
echo "Próximos passos:"
echo ""
echo "1. Acesse como usuário mvcash:"
echo "   su - $MVCASH_USER"
echo ""
echo "2. Vá para o diretório da aplicação:"
echo "   cd $APP_DIR"
echo ""
echo "3. Instale dependências (se necessário):"
echo "   pnpm install --ignore-scripts"
echo "   pnpm run postinstall:safe"
echo ""
echo "4. Faça o build:"
echo "   pnpm build"
echo ""
echo "5. Inicie o PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "6. Configure startup automático (como root):"
echo "   pm2 startup systemd -u $MVCASH_USER --hp $MVCASH_HOME"
echo ""
echo "=============================================="
