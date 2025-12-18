# Sistema de Gerenciamento de Resíduos

Este documento descreve o sistema de gerenciamento de resíduos implementado no sistema de trading, que trata quantidades muito pequenas de moedas que não podem ser vendidas efetivamente na exchange.

## O que são Resíduos?

Resíduos são quantidades muito pequenas de um ativo que permanecem após uma venda parcial ou completa de uma posição. Essas quantidades geralmente têm valor menor que $1 USD e não podem ser vendidas efetivamente na exchange devido a:

- **Quantidade Mínima**: Exchanges têm requisitos de quantidade mínima para ordens
- **Min Notional**: Valor mínimo da ordem (ex: $10 USD na Binance)
- **Precisão**: Quantidades muito pequenas podem não atender aos requisitos de precisão

## Threshold de Valor

O sistema considera um resíduo quando:

- **Valor < $1 USD**: `residueValueUSD = residueQty * currentPrice < 1.0`

Resíduos com valor >= $1 USD **não** são movidos para posições de resíduo e permanecem na posição original.

## Modelo de Dados

### TradePosition - Campos de Resíduo

```prisma
model TradePosition {
  // Campos existentes...
  
  // ✅ NOVO: Sistema de resíduos
  is_residue_position   Boolean   @default(false)
  parent_position_id    Int?
  
  // Relações
  parent_position   TradePosition?  @relation("ResidueMoves")
  residue_moves     TradePosition[] @relation("ResidueMoves")
  residue_transfers_out ResidueTransferJob[] @relation("ResidueSource")
  residue_transfers_in  ResidueTransferJob[] @relation("ResidueTarget")
}
```

### ResidueTransferJob

Tabela de auditoria que registra todas as transferências de resíduos:

```prisma
model ResidueTransferJob {
  id                    Int      @id @default(autoincrement())
  source_position_id    Int      // Posição origem
  target_position_id    Int?     // Posição de resíduo destino
  symbol                String
  qty_transferred       Decimal  // Quantidade transferida
  status                String   // PENDING, COMPLETED, FAILED
  reason_message        String?
  created_at            DateTime @default(now())
  completed_at          DateTime?
  
  source_position TradePosition @relation("ResidueSource")
  target_position TradePosition? @relation("ResidueTarget")
}
```

## ResidueService

O `ResidueService` é responsável por gerenciar a transferência de resíduos para posições consolidadas.

### Métodos Principais

#### `moveToResiduePosition()`

Move um resíduo de uma posição para uma posição de resíduo consolidada.

**Parâmetros:**
- `sourcePositionId`: ID da posição com resíduo
- `residueQty`: Quantidade do resíduo a ser transferida
- `currentPrice`: Preço atual para validação de valor

**Fluxo:**
1. Valida que o valor do resíduo é < $1 USD
2. Valida que a quantidade não excede `qty_remaining` da posição
3. Busca ou cria posição de resíduo consolidada para o símbolo
4. Se posição de resíduo existe: atualiza quantidade e preço médio ponderado
5. Se não existe: cria nova posição de resíduo
6. Subtrai resíduo da posição source
7. Se `qty_remaining` da source chegar a 0: fecha a posição com `close_reason = 'RESIDUE_MOVED'`
8. Cria `ResidueTransferJob` para auditoria

**Exemplo:**
```typescript
const residueService = new ResidueService(prisma);
const residuePositionId = await residueService.moveToResiduePosition(
  sourcePositionId,
  0.00012345, // Resíduo muito pequeno
  50000 // Preço atual BTC
);
```

#### `getResiduePosition()`

Busca a posição de resíduo consolidada para um símbolo específico.

**Parâmetros:**
- `symbol`: Símbolo do ativo (ex: "BTCUSDT")
- `exchangeAccountId`: ID da conta de exchange
- `tradeMode`: Modo de trading (REAL ou SIMULATION)

## Integração com PositionService

O sistema de resíduos é integrado no método `onSellExecuted()` do `PositionService`.

### Quando o Resíduo é Movido

Após uma venda parcial ou completa, se houver quantidade restante (`remainingQty`) após fechar a posição:

1. Calcula valor do resíduo: `residueValueUSD = remainingQty * avgPrice`
2. Se `residueValueUSD < 1`:
   - Chama `ResidueService.moveToResiduePosition()`
   - Resíduo é transferido para posição consolidada
   - Posição source é fechada se `qty_remaining` chegar a 0
3. Se `residueValueUSD >= 1`:
   - Resíduo permanece na posição original
   - Não é movido para posição de resíduo

### Exemplo de Fluxo

```
1. Posição BTC: 1.0 BTC @ $50,000
2. Venda executada: 0.999 BTC @ $50,000
3. Remaining qty: 0.001 BTC
4. Valor resíduo: 0.001 * $50,000 = $50 (>= $1) → NÃO move

1. Posição BTC: 1.0 BTC @ $50,000
2. Venda executada: 0.99999 BTC @ $50,000
3. Remaining qty: 0.00001 BTC
4. Valor resíduo: 0.00001 * $50,000 = $0.50 (< $1) → MOVE para posição de resíduo
```

## Integração com SL/TP Monitor

O monitor de SL/TP **pula** posições com resíduos muito pequenos para evitar tentar criar ordens de venda inválidas:

```typescript
const minQtyUSD = 1; // $1 USD mínimo
const estimatedValueUSD = position.qty_remaining * currentPrice;

if (estimatedValueUSD < minQtyUSD) {
  // Pula esta posição - resíduo muito pequeno
  continue;
}
```

## Posições de Resíduo Consolidadas

### Características

- **Uma por símbolo**: Uma posição de resíduo consolidada por símbolo, conta e modo
- **Preço médio ponderado**: Quando novos resíduos são adicionados, o preço é recalculado
- **Status OPEN**: Permanece aberta para acumular resíduos
- **Flag `is_residue_position = true`**: Identifica posições de resíduo

### Exemplo de Consolidação

```
Resíduo 1: 0.00001 BTC @ $50,000 → Posição resíduo criada
Resíduo 2: 0.00002 BTC @ $52,000 → Adicionado à mesma posição
Resíduo 3: 0.00001 BTC @ $51,000 → Adicionado à mesma posição

Posição resíduo final:
- qty_total: 0.00004 BTC
- price_open: $51,000 (média ponderada)
- is_residue_position: true
```

## Auditoria

Todas as transferências são registradas em `ResidueTransferJob`:

- **source_position_id**: Posição origem
- **target_position_id**: Posição de resíduo destino
- **qty_transferred**: Quantidade transferida
- **status**: COMPLETED (quando bem-sucedida)
- **created_at / completed_at**: Timestamps

## Benefícios

1. **Limpeza de Posições**: Posições originais são fechadas corretamente
2. **Consolidação**: Resíduos são agrupados para facilitar gerenciamento futuro
3. **Auditoria**: Histórico completo de transferências
4. **Prevenção de Erros**: Evita tentar vender quantidades inválidas na exchange

## Limitações

- **Threshold fixo**: $1 USD é um valor fixo (pode ser ajustado no código)
- **Uma posição por símbolo**: Resíduos do mesmo símbolo são sempre consolidados
- **Não vende automaticamente**: Posições de resíduo não são vendidas automaticamente

## Próximos Passos (Futuro)

- Dashboard para visualizar posições de resíduo
- Opção para vender posições de resíduo manualmente quando acumularem valor suficiente
- Configuração de threshold por símbolo ou conta

---

**Última atualização**: 2025-12-18

