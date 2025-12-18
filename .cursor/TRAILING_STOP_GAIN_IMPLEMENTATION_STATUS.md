# Trailing Stop Gain - Status de Implementação

**Data**: 18/12/2024
**Status**: EM ANDAMENTO - Backend 70% Completo

## ✅ COMPLETO

### Backend - Banco de Dados (100%)
- ✅ Migration criada: `packages/db/prisma/migrations/20251218000000_add_trailing_stop_gain/migration.sql`
- ✅ Schema Prisma atualizado com campos TSG em `trade_positions` e `trade_parameters`
- ✅ Campos adicionados:
  - `tsg_enabled`, `tsg_activation_pct`, `tsg_drop_pct`
  - `tsg_activated`, `tsg_max_pnl_pct`, `tsg_triggered`
  - `default_tsg_enabled`, `default_tsg_activation_pct`, `default_tsg_drop_pct`

### Backend - Domain Layer (100%)
- ✅ `packages/domain/src/positions/position.service.ts` - Método `updateSLTP()` estendido
- ✅ Validações implementadas:
  - TSG independente de TP
  - tsgActivationPct > 0
  - tsgDropPct > 0
  - TSG e SG fixo mutuamente exclusivos

### Backend - API Layer (100%)
- ✅ `apps/api/src/positions/dto/update-sltp.dto.ts` - Campos TSG adicionados
- ✅ `apps/api/src/positions/positions.controller.ts` - Controller atualizado
- ✅ WebSocket events incluem campos TSG

## ⏳ PENDENTE - CRÍTICO

### Backend - Monitors (0%) - **ALTA PRIORIDADE**
- ⏳ `apps/monitors/src/sltp-monitor/processors/sltp-monitor-real.processor.ts`
  - Adicionar lógica TSG após linha ~650 (após Stop Gain fixo)
  - Implementar: ativação, rastreamento de pico, venda via LIMIT
  - Lock otimista, verificação de jobs, reversão de flags
  
- ⏳ `apps/monitors/src/sltp-monitor/processors/sltp-monitor-sim.processor.ts`
  - Mesma lógica do monitor REAL

**Código a adicionar** (conforme plano):
```typescript
// === TRAILING STOP GAIN ===
if (position.tsg_enabled && 
    position.tsg_activation_pct && 
    position.tsg_drop_pct &&
    !position.tsg_triggered) {
  // Ver plano completo para implementação
}
```

### Backend - Trade Parameters Controller (0%)
- ⏳ `apps/api/src/trade-parameters/trade-parameters.controller.ts`
  - Aceitar campos `default_tsg_*` em create/update

### Frontend - Types (0%)
- ⏳ `apps/frontend/src/lib/types/index.ts`
  - Adicionar campos TSG à interface `Position`
  - Adicionar campos TSG ao `UpdateSLTPDto`

### Frontend - Components (0%) - **ALTA PRIORIDADE**
- ⏳ `apps/frontend/src/components/positions/UpdateSLTPModal.tsx`
  - Adicionar seção TSG (independente de TP)
  
- ⏳ `apps/frontend/src/components/parameters/WizardStepSLTP.tsx`
  - Adicionar configuração padrão TSG
  
- ⏳ `apps/frontend/src/app/(dashboard)/positions/[id]/page.tsx`
  - Adicionar coluna TSG na seção SL/TP
  
- ⏳ **NOVO**: `apps/frontend/src/components/positions/TSGMonitorCard.tsx`
  - Card visual com barras de progresso (ver plano)
  
- ⏳ `apps/frontend/src/app/(dashboard)/positions/page.tsx`
  - Adicionar badge TSG na listagem
  
- ⏳ Listagem de parâmetros
  - Adicionar indicador TSG

### Backend - Notifications (0%)
- ⏳ `packages/notifications/src/notification.service.ts`
  - Adicionar método `sendTrailingStopGainAlert()`

### Documentation (0%)
- ⏳ `docs/TRADING.md`
  - Adicionar seção Trailing Stop Gain

## 📋 INSTRUÇÕES PARA CONTINUAR

### Prioridade 1: Monitors (CRÍTICO)
Os monitors são o coração do TSG. Sem eles, nada funciona.

1. Abrir `apps/monitors/src/sltp-monitor/processors/sltp-monitor-real.processor.ts`
2. Localizar linha ~650 (após lógica de Stop Gain fixo)
3. Adicionar código completo do plano (linhas 150-285 do plano)
4. Repetir para `sltp-monitor-sim.processor.ts`

### Prioridade 2: Frontend Types & Components
1. Atualizar types
2. Atualizar UpdateSLTPModal
3. Criar TSGMonitorCard
4. Integrar em detalhes da posição

### Prioridade 3: Finalização
1. Trade Parameters Controller
2. Notifications
3. Documentation
4. Testes

## 🔧 COMANDOS ÚTEIS

```bash
# Aplicar migration
cd packages/db
npx prisma migrate dev

# Gerar Prisma Client
npx prisma generate

# Rebuild projeto
cd ../..
pnpm build

# Restart monitors
pm2 restart monitors
```

## ⚠️ PONTOS DE ATENÇÃO

1. **Lock Otimista**: Sempre usar `updateMany` com `where tsg_triggered = false`
2. **Ordem LIMIT**: Sempre `currentPrice * 0.999` (nunca MARKET)
3. **Verificar Jobs**: Sempre verificar jobs pendentes antes de criar novo
4. **Reverter Flags**: Try/catch + reverter tsg_triggered em caso de erro
5. **TSG Independente**: NÃO validar dependência de TP

## 📊 PROGRESSO GERAL

- Backend Database: ████████████████████ 100%
- Backend Domain: ████████████████████ 100%
- Backend API: ████████████████████ 100%
- Backend Monitors: ░░░░░░░░░░░░░░░░░░░░ 0% ⚠️
- Backend Parameters: ░░░░░░░░░░░░░░░░░░░░ 0%
- Frontend Types: ░░░░░░░░░░░░░░░░░░░░ 0%
- Frontend Components: ░░░░░░░░░░░░░░░░░░░░ 0% ⚠️
- Notifications: ░░░░░░░░░░░░░░░░░░░░ 0%
- Documentation: ░░░░░░░░░░░░░░░░░░░░ 0%

**GERAL**: ████████░░░░░░░░░░░░ 35%

## 🎯 PRÓXIMOS PASSOS IMEDIATOS

1. Implementar lógica TSG nos monitors (REAL e SIM) - CRÍTICO
2. Atualizar frontend types
3. Criar componentes de UI
4. Testar fluxo completo

## Ver Plano Completo

Arquivo: `c:\Users\Maycon\.cursor\plans\trailing_stop_gain_implementation_1b27e281.plan.md`

