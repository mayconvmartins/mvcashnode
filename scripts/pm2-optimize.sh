#!/bin/bash
# Script de Otimização PM2
# Aplica as configurações otimizadas e monitora o resultado

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Script de Otimização PM2 - MVCashNode        ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# Função para verificar se PM2 está instalado
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo -e "${RED}❌ PM2 não está instalado. Instale com: npm install -g pm2${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ PM2 detectado: $(pm2 -v)${NC}"
}

# Função para backup da configuração atual
backup_config() {
    if [ -f ecosystem.config.js ]; then
        BACKUP_FILE="ecosystem.config.js.backup.$(date +%Y%m%d_%H%M%S)"
        cp ecosystem.config.js "$BACKUP_FILE"
        echo -e "${GREEN}✅ Backup criado: $BACKUP_FILE${NC}"
    fi
}

# Função para aplicar configuração
apply_config() {
    echo ""
    echo -e "${YELLOW}📋 Aplicando configuração otimizada...${NC}"
    
    # Salvar estado atual
    pm2 save --force
    
    # Recarregar com nova configuração (sem downtime)
    pm2 reload ecosystem.config.js
    
    echo -e "${GREEN}✅ Configuração aplicada com sucesso!${NC}"
}

# Função para mostrar status
show_status() {
    echo ""
    echo -e "${BLUE}📊 Status dos processos:${NC}"
    pm2 list
    
    echo ""
    echo -e "${BLUE}💾 Uso de memória:${NC}"
    pm2 list | grep -E "(monitors|executor)"
}

# Função para limpar logs antigos
clean_logs() {
    echo ""
    echo -e "${YELLOW}🧹 Limpando logs antigos...${NC}"
    
    # Limpar logs do PM2
    pm2 flush
    
    # Rotacionar logs grandes (maiores que 100MB)
    for log in logs/*.log; do
        if [ -f "$log" ]; then
            SIZE=$(stat -f%z "$log" 2>/dev/null || stat -c%s "$log" 2>/dev/null)
            if [ "$SIZE" -gt 104857600 ]; then
                mv "$log" "$log.old.$(date +%Y%m%d_%H%M%S)"
                echo -e "${GREEN}  ✓ Rotacionado: $(basename $log)${NC}"
            fi
        fi
    done
    
    echo -e "${GREEN}✅ Logs limpos${NC}"
}

# Função para verificar jobs órfãos
check_orphan_jobs() {
    echo ""
    echo -e "${YELLOW}🔍 Verificando jobs órfãos no Redis...${NC}"
    
    if [ -f scripts/cleanup-orphan-jobs.ts ]; then
        npm run cleanup-orphan-jobs:dry
    else
        echo -e "${YELLOW}⚠️  Script de limpeza não encontrado${NC}"
    fi
}

# Função para monitoramento em tempo real
monitor() {
    echo ""
    echo -e "${BLUE}📈 Iniciando monitor em tempo real...${NC}"
    echo -e "${YELLOW}   (Pressione Ctrl+C para sair)${NC}"
    echo ""
    sleep 2
    pm2 monit
}

# Menu principal
show_menu() {
    echo ""
    echo -e "${BLUE}Escolha uma opção:${NC}"
    echo "  1) Aplicar otimizações"
    echo "  2) Verificar status"
    echo "  3) Limpar logs"
    echo "  4) Verificar jobs órfãos"
    echo "  5) Monitor em tempo real"
    echo "  6) Executar tudo (recomendado)"
    echo "  0) Sair"
    echo ""
}

# Main
main() {
    check_pm2
    
    # Se receber argumento --auto, executar tudo automaticamente
    if [ "$1" == "--auto" ] || [ "$1" == "-a" ]; then
        backup_config
        apply_config
        clean_logs
        check_orphan_jobs
        show_status
        echo ""
        echo -e "${GREEN}✅ Otimização completa!${NC}"
        echo -e "${YELLOW}💡 Execute 'pm2 monit' para monitorar em tempo real${NC}"
        exit 0
    fi
    
    # Menu interativo
    while true; do
        show_menu
        read -p "Opção: " choice
        
        case $choice in
            1)
                backup_config
                apply_config
                show_status
                ;;
            2)
                show_status
                ;;
            3)
                clean_logs
                ;;
            4)
                check_orphan_jobs
                ;;
            5)
                monitor
                ;;
            6)
                backup_config
                apply_config
                clean_logs
                check_orphan_jobs
                show_status
                echo ""
                echo -e "${GREEN}✅ Otimização completa!${NC}"
                ;;
            0)
                echo -e "${GREEN}👋 Até logo!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}❌ Opção inválida${NC}"
                ;;
        esac
    done
}

# Verificar se está no diretório correto
if [ ! -f ecosystem.config.js ]; then
    echo -e "${RED}❌ Erro: ecosystem.config.js não encontrado${NC}"
    echo -e "${YELLOW}   Execute este script da raiz do projeto: /opt/mvcashnode${NC}"
    exit 1
fi

# Executar
main "$@"

