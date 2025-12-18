# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.9.0] - 2025-12-18

### Adicionado

#### Sistema de Gerenciamento de Resíduos
- **ResidueService**: Novo serviço para gerenciar quantidades muito pequenas de moedas (< $1 USD)
- **ResidueTransferJob**: Modelo de auditoria para rastrear transferências de resíduos
- **Posições de Resíduo Consolidadas**: Sistema que agrupa resíduos do mesmo símbolo em uma única posição
- **Campos no TradePosition**:
  - `is_residue_position`: Flag para identificar posições de resíduo
  - `parent_position_id`: Link para posição de resíduo quando resíduo é movido

#### Trailing Stop Gain (TSG) Independente
- TSG agora funciona independentemente de Take Profit
- Bloqueio automático de webhook quando TSG está ativo
- Mutual exclusion automática: ao ativar TSG, desativa TP normal e SG fixo
- Rastreamento contínuo de pico máximo de lucro sem limite

#### Validações de Segurança Financeira
- **Prevenção de Double-Sell**: Múltiplas camadas de validação para evitar vendas duplicadas
- **Prevenção de Over-Selling**: Validação de quantidade vs posição antes de executar
- **Lock Otimista no Monitor**: Previne race conditions no monitor SL/TP
- **FOR UPDATE Lock**: Lock pessimista no PositionService para garantir atomicidade
- **Validação de position_id_to_close**: Todas ordens SELL devem ter posição vinculada
- **Double-Check após Lock**: Verificação adicional após adquirir lock para prevenir duplicatas

### Corrigido

#### Bugs Críticos de Ordens Duplicadas
- **Correção de estrutura TypeScript**: Corrigido erro estrutural no `trade-execution-real.processor.ts` (chave faltando)
- **Validação de PARTIALLY_FILLED**: Agora inclui status `PARTIALLY_FILLED` na verificação de ordens duplicadas
- **Remoção de Retry Mechanisms**: Removidos todos os mecanismos de retry que poderiam causar ordens duplicadas na exchange
- **Correção de Race Conditions**: Implementado lock otimista e pessimista para prevenir condições de corrida

#### Sistema de Resíduos
- Resíduos muito pequenos (< $1 USD) são automaticamente movidos para posições consolidadas
- Posições originais são fechadas corretamente quando resíduo é movido
- Monitor SL/TP agora pula posições com resíduos muito pequenos

#### UI/UX
- Corrigido badge "FIFO" que aparecia incorretamente (substituído por "⚠️ SEM POSIÇÃO (BUG)")
- Corrigidas cores de fundo do TSG no dark mode
- Badge de TSG agora sempre aparece na listagem de posições, mesmo quando aguardando lucro mínimo
- Monitor SL/TP ordena por padrão por "mais próximo do lucro"

### Alterado

#### Monitor SL/TP
- Ordenação padrão alterada para "mais próximo do lucro" (maior profit)
- Validação de quantidade mínima ($1 USD) antes de criar ordens de venda
- Removida seção de retry que poderia causar ordens duplicadas

#### Executor
- Validação pré-execução de quantidade vs posição
- Ajuste automático de quantidade se exceder posição em até 1% (arredondamentos)
- Abortar se quantidade exceder posição em mais de 1% (possível duplicata)

#### PositionService
- Implementado FOR UPDATE lock para prevenir race conditions
- Revalidação de posição após adquirir lock
- Integração com ResidueService para mover resíduos automaticamente

### Removido

- **Retry Mechanisms**: Removidos todos os mecanismos de retry que poderiam causar ordens duplicadas
- **Seção de Retry no Monitor**: Removida lógica que tentava recriar jobs para posições com flags triggered

### Migrations

- **20251218000001_add_residue_system**: Adiciona campos de resíduo em `trade_positions` e cria tabela `residue_transfer_jobs`

### Documentação

- **RESIDUE_HANDLING.md**: Novo documento explicando o sistema de gerenciamento de resíduos
- **SECURITY_VALIDATIONS.md**: Novo documento detalhando todas as validações de segurança financeira
- **CHANGELOG.md**: Este arquivo
- Atualizados: README.md, TRADING.md, ARCHITECTURE.md

## [1.0.0] - 2025-02-20

### Adicionado
- Versão inicial do sistema
- Autenticação JWT + 2FA
- Suporte a múltiplas exchanges (Binance, Bybit)
- Sistema de cofres virtuais
- Webhooks e monitoramento
- Stop Loss e Take Profit
- Notificações WhatsApp
- Sistema de assinaturas

---

## Tipos de Mudanças

- **Adicionado**: para novas funcionalidades
- **Alterado**: para mudanças em funcionalidades existentes
- **Descontinuado**: para funcionalidades que serão removidas em versões futuras
- **Removido**: para funcionalidades removidas
- **Corrigido**: para correções de bugs
- **Segurança**: para vulnerabilidades

---

**Última atualização**: 2025-12-18

