#!/bin/bash
# =============================================================================
# Script de Monitoramento de Segurança
# =============================================================================
# 
# Verifica e remove processos maliciosos (crypto miners) conhecidos
# Útil após aplicar patches de segurança para confirmar que a correção funcionou
#
# Uso: bash scripts/security-monitor.sh [--watch]
#   --watch: Monitora continuamente por 10 minutos
# =============================================================================

set -e

MALWARE_PATTERNS="Hrb|hSang|xmr|mine|coin|crypto|kdevtmpfsi|kinsing"
MALWARE_CRONS="/etc/cron.d/root"
MALWARE_BINS="/Hrb3wZ /57hSang /tmp/xmr /tmp/mine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo " Verificação de Segurança - MvCash Node"
echo "=============================================="
echo ""

# 1. Verificar processos maliciosos
echo "1. Verificando processos maliciosos..."
MALWARE_PROCS=$(ps aux | grep -E "$MALWARE_PATTERNS" | grep -v grep || true)
if [ -n "$MALWARE_PROCS" ]; then
    echo -e "   ${RED}❌ PROCESSOS MALICIOSOS DETECTADOS:${NC}"
    echo "$MALWARE_PROCS"
    echo ""
    echo "   Matando processos..."
    pkill -9 -f "$MALWARE_PATTERNS" 2>/dev/null || true
    echo -e "   ${GREEN}✅ Processos eliminados${NC}"
else
    echo -e "   ${GREEN}✅ Nenhum processo malicioso encontrado${NC}"
fi

# 2. Verificar cron jobs maliciosos
echo ""
echo "2. Verificando cron jobs maliciosos..."
if [ -f "$MALWARE_CRONS" ]; then
    echo -e "   ${RED}❌ CRON MALICIOSO DETECTADO: $MALWARE_CRONS${NC}"
    echo "   Conteúdo:"
    cat "$MALWARE_CRONS"
    echo ""
    echo "   Removendo..."
    rm -f "$MALWARE_CRONS"
    echo -e "   ${GREEN}✅ Cron removido${NC}"
else
    echo -e "   ${GREEN}✅ Nenhum cron malicioso encontrado${NC}"
fi

# 3. Verificar binários maliciosos
echo ""
echo "3. Verificando binários maliciosos..."
FOUND_BINS=""
for BIN in $MALWARE_BINS; do
    if [ -f "$BIN" ]; then
        FOUND_BINS="$FOUND_BINS $BIN"
    fi
done
if [ -n "$FOUND_BINS" ]; then
    echo -e "   ${RED}❌ BINÁRIOS MALICIOSOS DETECTADOS:${NC}"
    echo "  $FOUND_BINS"
    echo "   Removendo..."
    for BIN in $FOUND_BINS; do
        rm -f "$BIN" 2>/dev/null || true
    done
    echo -e "   ${GREEN}✅ Binários removidos${NC}"
else
    echo -e "   ${GREEN}✅ Nenhum binário malicioso encontrado${NC}"
fi

# 4. Verificar uso de CPU
echo ""
echo "4. Verificando uso de CPU..."
HIGH_CPU=$(ps aux --sort=-%cpu | head -5 | tail -4)
echo "   Top 4 processos por CPU:"
echo "$HIGH_CPU" | while read line; do
    CPU=$(echo "$line" | awk '{print $3}')
    CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf $i" "; print ""}')
    if (( $(echo "$CPU > 50" | bc -l) )); then
        echo -e "   ${YELLOW}⚠️  $CPU% - $CMD${NC}"
    else
        echo "      $CPU% - $CMD"
    fi
done

# 5. Verificar conexões suspeitas
echo ""
echo "5. Verificando conexões de rede suspeitas..."
SUSPICIOUS_PORTS="3333 4444 5555 8888 9999 14444 45700"
for PORT in $SUSPICIOUS_PORTS; do
    CONN=$(netstat -tulpn 2>/dev/null | grep ":$PORT" || ss -tulpn 2>/dev/null | grep ":$PORT" || true)
    if [ -n "$CONN" ]; then
        echo -e "   ${RED}❌ Conexão suspeita na porta $PORT:${NC}"
        echo "   $CONN"
    fi
done
echo -e "   ${GREEN}✅ Verificação de portas concluída${NC}"

# 6. Verificar usuário do PM2
echo ""
echo "6. Verificando usuário do PM2..."
PM2_USER=$(ps aux | grep "PM2" | grep -v grep | head -1 | awk '{print $1}' || true)
if [ "$PM2_USER" = "root" ]; then
    echo -e "   ${RED}❌ PM2 rodando como ROOT - RISCO DE SEGURANÇA!${NC}"
    echo "   Execute: sudo bash scripts/setup-non-root.sh"
elif [ -n "$PM2_USER" ]; then
    echo -e "   ${GREEN}✅ PM2 rodando como usuário: $PM2_USER${NC}"
else
    echo -e "   ${YELLOW}⚠️  PM2 não está rodando${NC}"
fi

echo ""
echo "=============================================="

# Modo watch
if [ "$1" = "--watch" ]; then
    echo "Monitorando por 10 minutos (Ctrl+C para sair)..."
    echo ""
    for i in {1..60}; do
        sleep 10
        PROCS=$(ps aux | grep -E "$MALWARE_PATTERNS" | grep -v grep | wc -l)
        TIMESTAMP=$(date '+%H:%M:%S')
        if [ "$PROCS" -gt 0 ]; then
            echo -e "[$TIMESTAMP] ${RED}⚠️  $PROCS processo(s) malicioso(s) detectado(s)!${NC}"
            pkill -9 -f "$MALWARE_PATTERNS" 2>/dev/null || true
        else
            echo "[$TIMESTAMP] ✅ Sistema limpo"
        fi
    done
    echo ""
    echo "Monitoramento concluído. Se nenhum processo apareceu, a correção funcionou!"
else
    echo ""
    echo "Para monitorar continuamente por 10 minutos:"
    echo "  bash scripts/security-monitor.sh --watch"
fi
