# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.10.0] - 2025-12-18

### Adicionado

#### Sistema de Passkeys (WebAuthn)
- **PasskeyService**: Serviço completo para registro e autenticação via WebAuthn
- **Login com Biometria**: Suporte a Face ID, Touch ID, Windows Hello
- **Multi-dispositivo**: Sincronização via iCloud Keychain, Google Password Manager
- **Gerenciamento no Perfil**: Interface para adicionar, renomear e remover passkeys
- **WebAuthn Conditional UI**: Passkeys aparecem no autofill do navegador automaticamente
- **Passkey Upgrade**: Prompt pós-login oferecendo cadastrar passkey
- **Endpoints da API**:
  - `POST /auth/passkeys/register/start` - Iniciar registro
  - `POST /auth/passkeys/register/finish` - Finalizar registro
  - `POST /auth/passkeys/authenticate/start` - Iniciar autenticação
  - `POST /auth/passkeys/authenticate/finish` - Finalizar autenticação
  - `GET /auth/passkeys` - Listar passkeys
  - `PUT /auth/passkeys/:id` - Atualizar nome
  - `DELETE /auth/passkeys/:id` - Remover passkey

#### Gerenciamento de Sessões
- **SessionService**: Gerenciamento completo de sessões de usuário
- **Multi-dispositivo**: Login simultâneo em vários dispositivos
- **Visualização de Sessões**: Ver todos os dispositivos conectados
- **Encerramento Remoto**: Desconectar dispositivos específicos ou todos
- **Detecção de Dispositivo**: Identificação automática de browser, SO e tipo
- **Endpoints da API**:
  - `GET /auth/sessions` - Listar sessões ativas
  - `DELETE /auth/sessions/:id` - Encerrar sessão
  - `POST /auth/sessions/terminate-others` - Encerrar outras sessões

#### Web Push Notifications
- **WebPushService**: Envio de notificações push via navegador
- **Service Worker**: Recebimento e exibição de notificações em background
- **WebPushProvider**: Context React para gerenciar subscriptions
- **Integração com PWA**: Funciona como app instalado
- **Prompt Automático**: Solicita permissão após login
- **Endpoints da API**:
  - `GET /notifications/webpush/vapid-public-key` - Obter chave VAPID
  - `POST /notifications/webpush/subscribe` - Registrar subscription
  - `DELETE /notifications/webpush/unsubscribe` - Remover subscription
  - `POST /notifications/webpush/test` - Enviar teste

#### Prompts Pós-Login
- **PostLoginPrompts**: Componente que gerencia sequência de prompts
- **NotificationPermissionPrompt**: Solicita permissão para notificações
- **PasskeyEnrollmentPrompt**: Oferece cadastrar Passkey
- **Opção "Não perguntar novamente"**: Salva preferência no localStorage
- **Sequência inteligente**: Um prompt de cada vez, apenas em logins recentes

#### Layout Mobile Corrigido
- **Barra Superior Mobile**: Nova barra fixa com menu hambúrguer e perfil
- **Perfil Acessível**: Dropdown de perfil agora visível no mobile
- **Header Responsivo**: Elementos ajustados para diferentes tamanhos de tela
- **Sidebar Melhorada**: Posicionamento correto abaixo da barra superior

#### Sistema de Templates Unificados
- **UnifiedTemplateService**: Gerenciamento centralizado de templates
- **Editor Visual**: Interface para editar templates com preview
- **Suporte Multi-canal**: WhatsApp, Email e Web Push
- **Templates Padrão**: 15+ tipos de templates pré-definidos
- **Preview em Tempo Real**: Visualização com dados de exemplo
- **Variáveis Dinâmicas**: Sistema de substituição `{variavel}`
- **Reset para Padrão**: Restaurar templates originais
- **Endpoints da API**:
  - `GET /admin/notifications/unified-templates` - Listar templates
  - `GET /admin/notifications/unified-templates/:type/:channel` - Obter template
  - `POST /admin/notifications/unified-templates` - Salvar template
  - `DELETE /admin/notifications/unified-templates/:type/:channel` - Resetar
  - `POST /admin/notifications/unified-templates/:type/:channel/preview` - Preview

### Corrigido

#### Sistema de Autenticação
- **"Lembre-me" Corrigido**: Agora funciona corretamente por 7 dias (ou 30 com rememberMe)
- **Renovação de Tokens**: Tokens são renovados automaticamente mantendo a sessão

#### Assinantes (Subscribers)
- **Modo Real Forçado**: Assinantes só podem usar modo REAL
- **Limite de Contas**: Bloqueio de cadastro quando limite do plano é atingido
- **Vínculo de Assinatura**: Corrigida exibição do plano na lista de assinantes
- **Filtro com Busca**: Filtro de assinantes agora permite digitar email
- **Sincronização de Webhooks**: Botão para re-sincronizar webhooks padrão
- **Símbolos Permitidos**: Campo para definir pares permitidos nos parâmetros padrão

#### Interface do Admin
- **Menu de Assinantes**: Removido link "Monitor SL/TP" para assinantes
- **Toggle Real/Simulation**: Oculto para usuários tipo assinante

### Alterado

#### Página de Login
- Layout modernizado com suporte a Passkeys
- Botão "Login com Passkey" para usuários com passkeys cadastradas
- Melhor feedback visual para erros

#### Página de Perfil
- Nova seção "Passkeys" para gerenciar chaves
- Nova seção "Sessões Ativas" para gerenciar dispositivos

#### Admin de Notificações
- Nova aba "Templates Unificados" como padrão
- Reorganização das abas existentes
- Preview visual por canal (WhatsApp, Email, Web Push)

### Migrations

- **20251219000000_add_passkeys_sessions_webpush**: Adiciona tabelas `passkeys`, `user_sessions`, `web_push_subscriptions` e `notification_templates`

### Documentação

- **PASSKEYS_AND_AUTH.md**: Documentação completa do sistema de Passkeys e sessões
- **WEB_PUSH_NOTIFICATIONS.md**: Guia de Web Push Notifications
- **UNIFIED_TEMPLATES.md**: Documentação do sistema de templates unificados
- **CHANGELOG.md**: Este arquivo atualizado

### Dependências

#### Backend
- `@simplewebauthn/server@^9.0.0`: WebAuthn para servidor
- `web-push@^3.6.6`: Envio de Web Push

#### Frontend
- `@simplewebauthn/browser@^10.0.0`: WebAuthn para cliente

---

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

