## API Partner — Guia de Integração (HMAC)

Este documento é para parceiros integrarem com a **API Partner** do PayMVM Checkout.

### Visão geral
- **Base URL (produção)**: `https://SEU_DOMINIO.com/api/partner_api.php/`
- **Formato**: REST + JSON
- **Autenticação**: API Key + Assinatura HMAC-SHA256
- **Permissões por credencial**: `read`, `write`, `sync`, `admin` (definidas no painel)
- **Rate limit**: configurável por credencial (padrão do sistema)

---

## Autenticação (API Key + HMAC)

### Headers obrigatórios
Envie sempre:
- `X-API-Key`: sua API Key
- `X-API-Timestamp`: timestamp Unix (segundos)
- `X-API-Signature`: assinatura HMAC
- `Content-Type: application/json` (para POST/PUT)

### Como gerar a assinatura
A assinatura é:
\[
\text{signature} = \text{HMAC-SHA256}(\text{timestamp} + ':' + \text{body}, \text{api_secret})
\]

Regras importantes:
- `timestamp` deve ser **Unix timestamp** (ex: `1736700000`).
- O servidor aceita diferença máxima de **5 minutos** (rejeita timestamps muito antigos/futuros).
- `body` deve ser **exatamente** o JSON enviado (string), sem alterações no meio do caminho.
  - Para **GET**, use `body=""` (string vazia).
- A signature é enviada em **hex lowercase** (resultado padrão do `hash_hmac`).

---

## Formato de resposta e erros

### Sucesso (padrão)

```json
{
  "success": true,
  "data": { }
}
```

### Erro (padrão)

```json
{
  "success": false,
  "error": {
    "message": "Mensagem do erro",
    "code": "ERROR_CODE"
  }
}
```

Erros comuns:
- `401 UNAUTHORIZED`
  - `MISSING_API_KEY`, `INVALID_API_KEY`
  - `MISSING_SIGNATURE`, `INVALID_SIGNATURE`
  - `MISSING_TIMESTAMP`, `INVALID_TIMESTAMP`
- `403 FORBIDDEN`
  - `PERMISSION_DENIED`
  - `ACCESS_DENIED` (produto/assinatura fora do escopo da credencial)
- `404 NOT_FOUND`
  - `ENDPOINT_NOT_FOUND`, `NOT_FOUND`
- `405 METHOD_NOT_ALLOWED`
- `429 RATE_LIMIT_EXCEEDED`

---

## Endpoints

### 1) Listar assinaturas
**GET** `/subscriptions`

Query params (opcionais):
- `status`: `ativo|trial|expirado|cancelado`
- `product_id`: integer
- `page`: integer (default 1)
- `limit`: integer (default 20, max 100)

Resposta (exemplo):

```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "id": 123,
        "user_email": "cliente@exemplo.com",
        "status": "ativo",
        "start_date": "2026-01-01",
        "end_date": "2026-02-01",
        "days_remaining": 20,
        "amount_paid": 97.0,
        "trial_ends_at": null,
        "created_at": "2026-01-01 10:00:00",
        "plan_id": 10,
        "plan_name": "Mensal",
        "plan_type": "mensal",
        "plan_days": 30,
        "product_id": 41,
        "product_name": "Produto X"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "pages": 1
    }
  }
}
```

---

### 2) Detalhar assinatura
**GET** `/subscriptions/{id}`

Exemplo:
- `/subscriptions/123`

---

### 3) Estender assinatura
**POST** `/subscriptions/{id}/extend`

Body JSON:
- `days` (int, 1..365)

Exemplo:

```json
{ "days": 30 }
```

---

### 4) Cancelar assinatura
**POST** `/subscriptions/{id}/cancel`

Body JSON:
- `reason` (string, opcional)

Exemplo:

```json
{ "reason": "Solicitação do cliente" }
```

---

### 5) Assinaturas de um usuário
**GET** `/users/{email}/subscriptions`

Exemplo:
- `/users/cliente%40exemplo.com/subscriptions`

---

### 6) Listar planos de assinatura de um produto
**GET** `/plans?product_id={id}`

Exemplo:
- `/plans?product_id=41`

---

### 7) Estatísticas (MRR, totals, etc)
**GET** `/stats`

Query param opcional:
- `product_id`

Exemplo:
- `/stats?product_id=41`

---

### 8) Sync — listar usuários ativos para um produto
**POST** `/sync/users`

Body JSON:
- `product_id` (obrigatório, integer)

Exemplo:

```json
{ "product_id": 41 }
```

---

### 9) Login / Validação de acesso (recomendado para autenticação no sistema parceiro)
**GET** `/auth/access?email={email}&product_id={id}`

Quando o partner precisa **permitir ou negar login** em um sistema externo, a forma recomendada é consultar este endpoint para saber se o usuário tem **assinatura ativa/trial não expirada** para um produto específico.

Query params:
- `email` (obrigatório, email)
- `product_id` (obrigatório, integer)

Resposta (exemplo — acesso liberado):

```json
{
  "success": true,
  "data": {
    "has_access": true,
    "subscription": {
      "id": 123,
      "status": "ativo",
      "end_date": "2026-02-01",
      "days_remaining": 20,
      "trial": false,
      "trial_ends_at": null,
      "plan_name": "Mensal",
      "plan_type": "mensal"
    }
  }
}
```

Resposta (exemplo — acesso negado):

```json
{
  "success": true,
  "data": {
    "has_access": false,
    "subscription": null
  }
}
```

Uso típico no login do partner:
- Se `has_access=true` → liberar acesso no sistema parceiro.
- Se `has_access=false` → negar login e orientar o usuário a renovar/assinar.

## Exemplos prontos

### Exemplo 1 — cURL (GET /subscriptions)

1) Defina variáveis:
- `API_KEY`
- `API_SECRET`

2) Gere timestamp:
- `TS=$(date +%s)`

3) Body vazio (GET):
- `BODY=""`

4) Gere assinatura:
- `SIG=$(printf \"%s\" \"$TS:$BODY\" | openssl dgst -sha256 -hmac \"$API_SECRET\" -hex | sed 's/^.* //')`

5) Execute:

```bash
curl -sS -X GET "https://SEU_DOMINIO.com/api/partner_api.php/subscriptions?page=1&limit=20" \
  -H "X-API-Key: $API_KEY" \
  -H "X-API-Timestamp: $TS" \
  -H "X-API-Signature: $SIG"
```

---

### Exemplo 2 — Node.js (fetch) (POST /sync/users)

```javascript
import crypto from 'crypto';

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const baseUrl = 'https://SEU_DOMINIO.com/api/partner_api.php';

const ts = Math.floor(Date.now() / 1000).toString();
const bodyObj = { product_id: 41 };
const body = JSON.stringify(bodyObj);

const signature = crypto
  .createHmac('sha256', API_SECRET)
  .update(`${ts}:${body}`)
  .digest('hex');

const res = await fetch(`${baseUrl}/sync/users`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-API-Timestamp': ts,
    'X-API-Signature': signature
  },
  body
});

const json = await res.json();
console.log(res.status, json);
```

---

### Exemplo 3 — PHP (cURL) (GET /plans?product_id=41)

```php
<?php
$apiKey = getenv('API_KEY');
$apiSecret = getenv('API_SECRET');

$ts = (string)time();
$body = ""; // GET = body vazio
$toSign = $ts . ":" . $body;
$signature = hash_hmac('sha256', $toSign, $apiSecret);

$url = "https://SEU_DOMINIO.com/api/partner_api.php/plans?product_id=41";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "X-API-Key: {$apiKey}",
  "X-API-Timestamp: {$ts}",
  "X-API-Signature: {$signature}",
]);

$resp = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP {$code}\n";
echo $resp . "\n";
```

---

## Boas práticas recomendadas
- **Não reutilize signature**: gere `timestamp` e signature por request.
- **Timeouts**: 10s connect / 30s total.
- **Retry**: se `429`, respeite backoff e reduza taxa.
- **Encode de email em path**: use URL-encoding (`@` → `%40`).
- **Logs**: logue `endpoint`, `http_code`, `error.code` e `error.message` (sem armazenar secret).

