# MvM Pay (Checkout Externo) — Setup e Testes no MVCash

Este guia descreve como parametrizar e testar a integração do **MVCash** com o **MvM Pay** (Partner API com HMAC + checkout externo).

## Pré-requisitos

- **Banco/migrations** aplicadas (necessário para tabelas/campos do MvM Pay e tokens):
  - `mvm_pay_config`
  - `subscription_plans.mvm_pay_plan_id`
  - `registration_tokens` (ativação por link)
- `ENCRYPTION_KEY` configurada no `.env` (mín. 32 chars) — usada para criptografar `api_secret_enc`.
- `FRONTEND_URL` configurada (usada para montar links de ativação e return do checkout).
- Build e restart das apps via PM2 conforme seu processo de deploy.

## 1) Configurar MvM Pay no Admin

No Admin do MVCash: **Admin → MvM Pay**

- **Base URL (Partner API)**: ex `https://pay.mvmdev.com/api/partner_api.php`
- **Checkout URL (redirect)**: ex `https://pay.mvmdev.com/redirect/checkout`
- **API Key**: `pk_...`
- **API Secret**: `sk_...` (cole completo ao criar/alterar)
- **product_id**: ex `42`
- **Ativo**: ON

Depois clique em **Testar conexão**.

## 2) Definir o provedor de assinatura

No Admin do MVCash: **Admin → MvM Pay**

- **Modo**: `MvM Pay` (isso troca o `subscription_provider` para `mvm_pay`)

> Quando `subscription_provider=mvm_pay`, o login e a finalização de cadastro passam a validar acesso via Partner API.

## 3) Mapear planos (obrigatório)

No Admin do MVCash: **Admin → Planos de Assinatura**

Para cada plano local que existe no MVCash, preencha:
- **ID MvM Pay** (`mvm_pay_plan_id`)

Isso cria o mapeamento:
- Plano do MvM Pay (`plan_id`) → Plano do MVCash (`subscription_plans.id`)

Sem esse mapeamento, o cadastro/ativação via MvM Pay falha com erro de “plano não mapeado”.

## 4) Fluxo de checkout (usuário)

1. Usuário escolhe plano em `/subscribe`.
2. MVCash chama `POST /subscriptions/checkout`.
3. Se `subscription_provider=mvm_pay`, o retorno traz `checkout_url` para redirecionar ao MvM Pay.
4. Após o pagamento, o MvM Pay redireciona para `/subscribe/mvm-pay/return` (front).
5. Usuário finaliza criando senha em `/subscribe/register`.

## 5) Fluxo de ativação (pagou no MvM Pay, mas não criou senha)

### 5.1 CTA no Login (usuário)

Se o usuário tentar logar e o backend identificar que:
- `subscription_provider=mvm_pay`
- o usuário tem acesso no MvM Pay
- mas ainda não ativou/cadastrou senha no MVCash

o frontend mostra o botão **“Ativar conta”** na tela de login.

Ao clicar:
- o front chama `POST /subscriptions/mvm-pay/activate { email }`
- o backend gera token **24h / uso único** e envia email com o link para o usuário criar senha

### 5.2 Admin copiar link de ativação

Em **Admin → Assinantes → Detalhe do assinante**, quando a assinatura for MvM Pay, existe o botão:

- **“Copiar link de ativação (MvM Pay)”**

Ele chama:
- `POST /admin/subscribers/:id/mvm-pay/activation-link`

e copia para a área de transferência um link no formato:

`{FRONTEND_URL}/subscribe/register?token=...&email=...`

> Esse link expira em 24h e é uso único.

## 6) Endpoints relevantes

### MVCash

- `POST /subscriptions/mvm-pay/activate` — gera token (24h/uso único) e envia email de ativação
- `POST /subscriptions/register` — finaliza cadastro (para MvM Pay exige `token` + `email`)
- `POST /admin/subscribers/:id/mvm-pay/activation-link` — gera link para admin copiar/enviar manualmente

### MvM Pay (Partner API)

- `GET /plans?product_id=...`
- `GET /auth/access?email=...&product_id=...`
- `GET /users/{email}/subscriptions`
- `POST /sync/users { product_id }`

## 7) Teste manual de HMAC (no servidor)

Exemplo de `GET /plans` via curl assinado:

```bash
API_KEY='SUA_PK'
API_SECRET='SUA_SK'
BASE='https://pay.mvmdev.com/api/partner_api.php'

TS=$(date +%s)
BODY=""
SIG=$(printf "%s" "$TS:$BODY" | openssl dgst -sha256 -hmac "$API_SECRET" -hex | sed 's/^.* //')

curl -i -sS "$BASE/plans?product_id=42" \
  -H "X-API-Key: $API_KEY" \
  -H "X-API-Timestamp: $TS" \
  -H "X-API-Signature: $SIG"
```

## 8) Troubleshooting

- **403 no /plans**:
  - verifique se `api_secret` não foi salvo com whitespace (agora o backend faz `trim()`), e se `ENCRYPTION_KEY` é a mesma entre deploys.
  - confirme a chamada via curl assinado no mesmo servidor.
- **“plano não mapeado”**:
  - falta preencher `mvm_pay_plan_id` no plano local correspondente.
- **Usuário não consegue ativar**:
  - verifique se o email tem `has_access=true` no `/auth/access`.
  - gere um novo link (admin ou CTA no login) e confira expiração (24h).

