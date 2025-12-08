# Módulo de Assinaturas

Este documento descreve o módulo de assinaturas implementado no sistema.

## Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```env
# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=seu-access-token-do-mercadopago
MERCADOPAGO_PUBLIC_KEY=sua-public-key-do-mercadopago
MERCADOPAGO_WEBHOOK_SECRET=seu-webhook-secret-do-mercadopago
MERCADOPAGO_ENVIRONMENT=sandbox  # ou 'production'
SUBSCRIPTION_WEBHOOK_URL=https://seu-dominio.com/subscriptions/webhooks/mercadopago
FRONTEND_URL=https://seu-dominio.com  # URL do frontend para redirecionamentos
```

## Configuração do Mercado Pago

1. Acesse o [Painel do Mercado Pago](https://www.mercadopago.com.br/developers/panel)
2. Crie uma aplicação
3. Obtenha o Access Token e Public Key
4. Configure o webhook na aplicação apontando para `SUBSCRIPTION_WEBHOOK_URL`
5. Obtenha o Webhook Secret nas configurações de webhooks

## Fluxo de Assinatura

1. **Escolha do Plano** (`/subscribe`)
   - Usuário escolhe plano (mensal ou trimestral)
   - Redireciona para checkout

2. **Checkout** (`/subscribe/checkout`)
   - Preenchimento de dados pessoais e endereço
   - Integração com BrasilAPI/ViaCEP para busca de CEP
   - Validação de CPF e dados

3. **Pagamento** (`/subscribe/payment`)
   - Integração com Mercado Pago (checkout transparente)
   - Opções: Cartão de Crédito ou PIX
   - Aguarda confirmação do pagamento

4. **Webhook**
   - Mercado Pago envia webhook quando pagamento é aprovado
   - Sistema cria/ativa usuário e assinatura
   - Envia email com link para finalizar cadastro

5. **Finalização** (`/subscribe/register/[token]`)
   - Usuário define senha
   - Login automático

## Estrutura de Dados

### SubscriptionPlan
- Planos de assinatura disponíveis
- Preços mensais e trimestrais
- Recursos incluídos

### Subscription
- Assinatura do usuário
- Status: ACTIVE, CANCELLED, EXPIRED, PENDING_PAYMENT
- Datas de início e fim
- Auto-renovação

### SubscriberProfile
- Dados completos do assinante
- CPF criptografado
- Endereço completo

### SubscriberParameters
- Parâmetros padrão aplicados automaticamente
- Configurados pelo admin
- Aplicados ao criar ExchangeAccount e TradeParameter

## Endpoints da API

### Públicos
- `GET /subscriptions/plans` - Listar planos ativos
- `POST /subscriptions/checkout` - Criar checkout
- `POST /subscriptions/webhooks/mercadopago` - Webhook do MP
- `POST /subscriptions/register` - Finalizar registro

### Autenticados (Assinantes)
- `GET /subscriptions/my-subscription` - Minha assinatura
- `GET /subscriptions/my-plan` - Detalhes do plano
- `POST /subscriptions/cancel` - Cancelar assinatura
- `POST /subscriptions/renew` - Renovar assinatura

### Admin
- `GET /admin/subscription-plans` - Listar planos
- `POST /admin/subscription-plans` - Criar plano
- `PUT /admin/subscription-plans/:id` - Atualizar plano
- `DELETE /admin/subscription-plans/:id` - Desativar plano
- `GET /admin/subscriptions` - Listar assinaturas
- `GET /admin/subscriptions/:id` - Detalhes da assinatura
- `PUT /admin/subscriptions/:id` - Atualizar assinatura
- `POST /admin/subscriptions/:id/extend` - Estender validade
- `GET /admin/subscribers` - Listar assinantes
- `GET /admin/subscribers/:id` - Detalhes do assinante
- `PUT /admin/subscribers/:id` - Atualizar assinante
- `POST /admin/subscribers/:id/change-password` - Trocar senha
- `GET /admin/subscriber-parameters` - Listar parâmetros
- `PUT /admin/subscriber-parameters/:userId` - Atualizar parâmetros

## Aplicação Automática de Parâmetros

Quando um assinante cria uma ExchangeAccount ou TradeParameter, os valores de `SubscriberParameters` são aplicados automaticamente como padrão, mas podem ser sobrescritos manualmente.

## Restrições para Assinantes

- Assinantes **NÃO** podem criar contas em modo simulação
- Apenas modo REAL disponível
- Validação automática ao criar ExchangeAccount

## Validações

- CPF: formato e dígitos verificadores
- CEP: formato e busca automática de endereço
- Email: único no sistema
- Senha: mínimo 8 caracteres

## Segurança

- CPF e dados sensíveis são criptografados
- Webhooks do Mercado Pago são validados por assinatura
- Rate limiting em endpoints públicos
- Tokens de registro com expiração
