# Sistema de Passkeys e Autenticação Avançada

## Visão Geral

O MVCash agora suporta autenticação via Passkeys (WebAuthn), permitindo login biométrico seguro em dispositivos compatíveis (Face ID, Touch ID, Windows Hello, etc.), além de melhorias significativas no gerenciamento de sessões.

## Funcionalidades

### 1. Passkeys (WebAuthn)

#### O que são Passkeys?
Passkeys são credenciais criptográficas armazenadas de forma segura no dispositivo do usuário. Elas substituem senhas tradicionais por autenticação biométrica ou PIN do dispositivo.

#### Benefícios
- **Segurança**: Resistente a phishing e ataques de força bruta
- **Conveniência**: Login instantâneo com biometria
- **Multi-dispositivo**: Sincronização via iCloud Keychain, Google Password Manager, etc.
- **Compatibilidade**: Funciona em iOS, Android, Windows, macOS e Linux

#### Fluxo de Registro
1. Usuário acessa Perfil → Passkeys
2. Clica em "Adicionar Passkey"
3. Sistema solicita autenticação biométrica
4. Passkey é registrada e associada à conta

#### Fluxo de Login com Passkey
**Método 1 - Conditional UI (Autofill)**:
1. Usuário começa a digitar o email
2. Navegador mostra passkeys disponíveis no autofill
3. Usuário seleciona a passkey
4. Login realizado automaticamente

**Método 2 - Botão Manual**:
1. Usuário digita email
2. Se email tem passkeys, botão "Entrar com Passkey" aparece
3. Clica no botão
4. Sistema solicita autenticação biométrica
5. Login realizado

#### Passkey Upgrade (Pós-Login Enrollment)
Após login com senha, o sistema oferece cadastrar uma Passkey:
1. Usuário faz login com email/senha
2. Dialog aparece oferecendo cadastrar Passkey
3. Opções: "Configurar Passkey", "Mais Tarde", "Não perguntar novamente"
4. Se aceitar, processo de registro é iniciado

### 2. Gerenciamento de Sessões

O sistema agora mantém registro de todas as sessões ativas do usuário.

#### Recursos
- **Multi-dispositivo**: Login simultâneo em vários dispositivos
- **Visualização de sessões**: Ver todos os dispositivos conectados
- **Encerramento remoto**: Desconectar dispositivos específicos
- **Detecção de dispositivo**: Identificação automática de browser, SO e tipo de dispositivo

#### Informações da Sessão
- Nome do dispositivo (detectado automaticamente)
- Tipo (desktop/mobile/tablet)
- Browser e versão
- Sistema operacional
- Endereço IP
- Última atividade
- Data de criação
- Método de autenticação (senha ou passkey)

### 3. "Lembre-me" Corrigido

O sistema "Lembre-me" foi completamente reformulado:

- **Sem "Lembre-me"**: Sessão expira em 7 dias
- **Com "Lembre-me"**: Sessão expira em 30 dias
- Tokens são renovados automaticamente a cada uso

## Arquitetura

### Backend

#### Modelos Prisma

```prisma
model Passkey {
  id            Int      @id @default(autoincrement())
  user_id       Int
  credential_id String   @unique @db.VarChar(500)
  public_key    String   @db.Text
  counter       BigInt   @default(0)
  device_name   String?  @db.VarChar(255)
  transports    String?  @db.VarChar(255)
  user_agent    String?  @db.Text
  last_used_at  DateTime?
  created_at    DateTime @default(now())
  
  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@index([user_id])
  @@map("passkeys")
}

model UserSession {
  id               Int      @id @default(autoincrement())
  user_id          Int
  session_token    String   @unique @db.VarChar(500)
  refresh_token    String   @unique @db.VarChar(500)
  device_name      String?  @db.VarChar(255)
  device_type      String?  @db.VarChar(50)
  browser          String?  @db.VarChar(100)
  os               String?  @db.VarChar(100)
  user_agent       String?  @db.Text
  ip_address       String?  @db.VarChar(45)
  remember_me      Boolean  @default(false)
  is_passkey_auth  Boolean  @default(false)
  expires_at       DateTime
  last_activity_at DateTime @default(now())
  created_at       DateTime @default(now())
  
  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@index([user_id])
  @@map("user_sessions")
}
```

#### Serviços

**PasskeyService** (`packages/domain/src/auth/passkey.service.ts`)
- `generateRegistrationOptions()`: Gera opções para registro de nova passkey
- `verifyRegistration()`: Verifica e salva nova passkey
- `generateAuthenticationOptions()`: Gera opções para autenticação
- `verifyAuthentication()`: Verifica autenticação e retorna usuário
- `listPasskeys()`: Lista passkeys do usuário
- `deletePasskey()`: Remove uma passkey
- `updatePasskeyName()`: Atualiza nome do dispositivo

**SessionService** (`packages/domain/src/auth/session.service.ts`)
- `createSession()`: Cria nova sessão
- `refreshSession()`: Renova sessão existente
- `validateRefreshToken()`: Valida refresh token
- `listSessions()`: Lista sessões ativas
- `terminateSession()`: Encerra sessão específica
- `terminateOtherSessions()`: Encerra todas exceto atual
- `terminateAllSessions()`: Encerra todas as sessões

#### Endpoints da API

##### Passkeys
```
POST /auth/passkeys/register/start     # Iniciar registro
POST /auth/passkeys/register/finish    # Finalizar registro
POST /auth/passkeys/authenticate/start # Iniciar autenticação
POST /auth/passkeys/authenticate/finish# Finalizar autenticação
POST /auth/passkeys/check-email        # Verificar se email tem passkeys
GET  /auth/passkeys                    # Listar passkeys
PUT  /auth/passkeys/:id                # Atualizar nome
DELETE /auth/passkeys/:id              # Remover passkey
```

##### Sessões
```
GET    /auth/sessions                  # Listar sessões ativas
DELETE /auth/sessions/:id              # Encerrar sessão específica
POST   /auth/sessions/terminate-others # Encerrar outras sessões
```

### Frontend

#### Página de Login (`apps/frontend/src/app/login/page.tsx`)
- Botão "Login com Passkey" para usuários com passkeys cadastradas
- Detecção automática se o email possui passkeys

#### Página de Perfil (`apps/frontend/src/app/(dashboard)/profile/page.tsx`)
- Seção "Passkeys" para gerenciar chaves
- Seção "Sessões Ativas" para gerenciar dispositivos conectados

## Dependências

### Backend
- `@simplewebauthn/server@^9.0.0`: Biblioteca WebAuthn para servidor

### Frontend
- `@simplewebauthn/browser@^10.0.0`: Biblioteca WebAuthn para cliente

## Configuração

### Variáveis de Ambiente

```env
# Passkeys (WebAuthn)
PASSKEY_RP_NAME=MVCash Trading
PASSKEY_RP_ID=app.mvcash.com.br
PASSKEY_ORIGIN=https://app.mvcash.com.br
```

## Migração

Execute a migração para criar as tabelas necessárias:

```bash
pnpm --filter @mvcashnode/db prisma migrate deploy
```

## Segurança

### Desafios (Challenges)
- Armazenados em memória com expiração de 5 minutos
- Limpos automaticamente após uso
- Um challenge por operação

### Contadores
- Cada passkey mantém um contador que incrementa a cada uso
- Previne ataques de replay

### Verificação de Usuário
- Sempre requer verificação do usuário (biometria/PIN)
- `userVerification: 'required'`

## Compatibilidade

### Navegadores Suportados
- Chrome 67+
- Firefox 60+
- Safari 13+
- Edge 79+

### Dispositivos
- **iOS**: iPhone com Face ID/Touch ID (iOS 14+)
- **Android**: Dispositivos com fingerprint (Android 7+)
- **Windows**: Windows Hello (Windows 10+)
- **macOS**: Touch ID em MacBooks compatíveis

## Prompts Pós-Login

### Sequência de Prompts
Após login com senha, o sistema exibe prompts na seguinte ordem:
1. **Notificações Push**: Se permissão é 'default' (nunca perguntado)
2. **Cadastro de Passkey**: Se usuário não tem nenhuma passkey

### Componentes

**PostLoginPrompts** (`apps/frontend/src/components/auth/PostLoginPrompts.tsx`)
- Gerencia a sequência de prompts
- Mostra um prompt de cada vez
- Apenas após login recente (10 segundos)

**NotificationPermissionPrompt** (`apps/frontend/src/components/notifications/NotificationPermissionPrompt.tsx`)
- Solicita permissão para notificações push
- Opção "Não perguntar novamente"

**PasskeyEnrollmentPrompt** (`apps/frontend/src/components/auth/PasskeyEnrollmentPrompt.tsx`)
- Oferece cadastrar Passkey
- Explica benefícios de forma clara
- Opção "Não perguntar novamente"

### Flags de Preferência (localStorage)
- `mvcash_skip_notification_prompt`: Não mostrar prompt de notificações
- `mvcash_skip_passkey_prompt`: Não mostrar prompt de passkey

## Troubleshooting

### Passkey não funciona
1. Verifique se o dispositivo suporta WebAuthn
2. Confirme que está usando HTTPS
3. Verifique as variáveis de ambiente PASSKEY_*

### Conditional UI não aparece
1. Verifique se o navegador suporta (Chrome 108+, Safari 16+)
2. Confirme que o input tem `autoComplete="username webauthn"`
3. Teste em modo anônimo (extensões podem interferir)

### Sessão expira muito rápido
1. Verifique se "Lembre-me" está marcado no login
2. Confirme que os cookies não estão sendo bloqueados

### Não consigo ver minhas sessões
1. Faça logout e login novamente
2. A sessão precisa ser criada com o novo sistema

### Prompts não aparecem após login
1. Verifique se `markLoginTime()` está sendo chamado no login
2. Prompts só aparecem em logins recentes (10 segundos)
3. Verifique se não há flag de "não perguntar" no localStorage

