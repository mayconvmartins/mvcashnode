# Integração TransFi Gateway de Pagamento

Este documento descreve a integração do gateway TransFi para aceitar pagamentos via PIX, cartão e criptomoedas, recebendo sempre em USDT.

## Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env` (opcional, se não usar configuração via admin):

```env
# TransFi
TRANSFI_MERCHANT_ID=seu-merchant-id-do-transfi
TRANSFI_AUTHORIZATION_TOKEN=seu-authorization-token-do-transfi
TRANSFI_WEBHOOK_SECRET=seu-webhook-secret-do-transfi
TRANSFI_ENVIRONMENT=sandbox  # ou 'production'
TRANSFI_WEBHOOK_URL=https://seu-dominio.com/subscriptions/webhooks/transfi
FRONTEND_URL=https://seu-dominio.com  # URL do frontend para redirecionamentos
```

## Configuração do TransFi

1. Acesse o [Painel do TransFi](https://docs.transfi.com)
2. Crie uma conta e obtenha suas credenciais:
   - Merchant ID (MID)
   - Authorization Token
3. Configure o webhook no painel do TransFi apontando para `TRANSFI_WEBHOOK_URL`
4. Obtenha o Webhook Secret nas configurações de webhooks (opcional, mas recomendado)

## Configuração via Admin

A configuração pode ser feita através da interface administrativa:

1. Acesse `/admin/transfi`
2. Vá para a aba "Configuração"
3. Preencha:
   - **Merchant ID**: Seu MID do TransFi
   - **Authorization Token**: Token de autorização (criptografado)
   - **Webhook Secret**: Secret para validar webhooks (opcional)
   - **Ambiente**: Sandbox ou Produção
   - **Webhook URL**: URL gerada automaticamente ou customizada
4. Clique em "Salvar Configuração"
5. Teste a conexão com o botão "Testar Conexão"

## Fluxo de Pagamento

### 1. Payin Fiat (PIX/Cartão → USDT)

O TransFi permite receber pagamentos em moedas fiat (BRL, USD, etc) e converter automaticamente para USDT:

```typescript
// Exemplo de criação de payin
const order = await transfiService.createPayin({
  amount: 100.00,
  currency: 'BRL',
  paymentMethod: 'PIX', // ou 'CARD'
  description: 'Assinatura Mensal',
  customerData: {
    email: 'cliente@example.com',
    fullName: 'João Silva',
    cpf: '12345678900',
  },
});
```

### 2. Payin Crypto (Criptomoedas → USDT)

Também é possível receber pagamentos em criptomoedas que são convertidas para USDT:

```typescript
// Exemplo de criação de crypto payin
const order = await transfiService.createCryptoPayin({
  amount: 0.001,
  sourceCurrency: 'BTC',
  description: 'Assinatura Mensal',
  customerData: {
    email: 'cliente@example.com',
    walletAddress: '0x...', // opcional
  },
});
```

### 3. Webhook

O TransFi envia webhooks quando o status de um pedido muda:

- **Endpoint**: `POST /subscriptions/webhooks/transfi`
- **Eventos suportados**:
  - `order.status_changed`: Status do pedido mudou
  - `payment.completed`: Pagamento completado
  - `payment.failed`: Pagamento falhou

### 4. Processamento Automático

Quando um pagamento é aprovado:
1. O webhook é recebido e validado
2. O evento é salvo no banco de dados
3. A assinatura é ativada automaticamente
4. O usuário recebe um email de confirmação
5. O usuário pode finalizar o cadastro definindo sua senha

## Sincronização Automática

Um cron job executa a cada 5 minutos para sincronizar pagamentos pendentes:

- Verifica pagamentos das últimas 24 horas
- Atualiza status de pagamentos pendentes
- Processa pagamentos aprovados que não foram processados via webhook

A sincronização também pode ser disparada manualmente via:
- Interface admin: Botão "Sincronizar com TransFi" na aba Pagamentos
- API: `POST /admin/transfi/sync-payments`

## Estornos

Estornos podem ser feitos através da interface administrativa:

1. Acesse `/admin/transfi`
2. Vá para a aba "Pagamentos"
3. Clique em "Estornar" no pagamento desejado
4. Confirme o estorno
5. Opcionalmente, marque para cancelar a assinatura relacionada

O estorno é processado via endpoint de payout do TransFi.

## Endpoints da API

### Admin

- `GET /admin/transfi/config` - Obter configuração
- `PUT /admin/transfi/config` - Atualizar configuração
- `POST /admin/transfi/test-connection` - Testar conexão
- `GET /admin/transfi/payments` - Listar pagamentos
- `GET /admin/transfi/payments/:id` - Detalhes do pagamento
- `POST /admin/transfi/payments/:id/refund` - Estornar pagamento
- `GET /admin/transfi/webhook-logs` - Logs de webhook
- `GET /admin/transfi/webhook-logs/:id` - Detalhes do log
- `POST /admin/transfi/sync-payments` - Sincronização manual

### Públicos

- `POST /subscriptions/webhooks/transfi` - Webhook do TransFi

## Estrutura de Dados

### TransFiConfig

- `merchant_id`: Merchant ID do TransFi
- `authorization_token_enc`: Token criptografado
- `webhook_secret_enc`: Secret criptografado (opcional)
- `environment`: 'sandbox' | 'production'
- `webhook_url`: URL do webhook
- `is_active`: Status ativo/inativo

### TransFiWebhookEvent

- `transfi_event_id`: ID único do evento
- `transfi_event_type`: Tipo do evento
- `transfi_resource_id`: ID do recurso (orderId)
- `raw_payload_json`: Payload completo do evento
- `processed`: Se foi processado
- `processed_at`: Data de processamento

### SubscriptionPayment (campos TransFi)

- `transfi_order_id`: ID do pedido no TransFi
- `transfi_payment_id`: ID do pagamento no TransFi
- `payment_method`: Pode ser 'CARD', 'PIX' ou 'CRYPTO'

## Diferenças do Mercado Pago

1. **Autenticação**: Basic Auth com MID + Authorization Token (não Bearer Token)
2. **Moedas**: Suporte a múltiplas moedas fiat e crypto
3. **Recebimento**: Sempre em USDT (stablecoin)
4. **Webhook**: Estrutura diferente, eventos específicos do TransFi
5. **Estornos**: Via endpoint de payout (não refund direto)

## Segurança

- Tokens e secrets são criptografados antes de serem armazenados
- Webhooks são validados por assinatura HMAC SHA256
- Dados sensíveis não são expostos na API
- Rate limiting aplicado em todos os endpoints

## Troubleshooting

### Webhook não está sendo recebido

1. Verifique se a URL do webhook está correta no painel do TransFi
2. Confirme que o servidor está acessível publicamente
3. Verifique os logs de webhook na interface admin
4. Teste a conexão com o botão "Testar Conexão"

### Pagamento não está sendo processado

1. Verifique se a configuração está ativa (`is_active: true`)
2. Confira os logs de webhook para ver se o evento foi recebido
3. Execute sincronização manual
4. Verifique os logs do sistema para erros

### Erro ao estornar pagamento

1. Confirme que o pagamento está aprovado
2. Verifique se o pedido ainda existe no TransFi
3. Confira as credenciais de autenticação
4. Veja os logs de erro na interface admin

## Referências

- [Documentação TransFi](https://docs.transfi.com/reference)
- [API Reference](https://docs.transfi.com/reference)
