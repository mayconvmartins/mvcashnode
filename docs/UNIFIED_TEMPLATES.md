# Sistema de Templates Unificados

## Visão Geral

O MVCash possui um sistema de templates unificado que permite gerenciar notificações para WhatsApp, Email e Web Push em um único local, com preview em tempo real e validação de variáveis.

## Funcionalidades

### Editor de Templates Unificado

Acesso: **Admin → Notificações → Templates Unificados**

- **Visualização por Canal**: Abas separadas para WhatsApp, Email e Web Push
- **Filtro por Tipo**: Filtrar templates por tipo de evento
- **Editor de Código**: Syntax highlighting para templates
- **Preview em Tempo Real**: Visualização renderizada com dados de exemplo
- **Variáveis Dinâmicas**: Lista de variáveis disponíveis com click-to-copy
- **Reset para Padrão**: Restaurar template original

### Canais Suportados

| Canal | Formato | Características |
|-------|---------|-----------------|
| WhatsApp | Texto formatado | Suporta *negrito*, _itálico_, ~tachado~ |
| Email | HTML/Texto | Suporta HTML completo com estilos |
| Web Push | Texto simples | Título + corpo + ícone + ação |

### Tipos de Template

| Tipo | Descrição | Canais |
|------|-----------|--------|
| `WEBHOOK_RECEIVED` | Webhook recebido | WhatsApp, Email, WebPush |
| `POSITION_OPENED` | Posição aberta | WhatsApp, Email, WebPush |
| `POSITION_CLOSED` | Posição fechada | WhatsApp, Email, WebPush |
| `POSITION_ERROR` | Erro na posição | WhatsApp, Email, WebPush |
| `SL_HIT` | Stop Loss atingido | WhatsApp, WebPush |
| `TP_HIT` | Take Profit atingido | WhatsApp, WebPush |
| `SG_HIT` | Stop Gain atingido | WhatsApp, WebPush |
| `TSG_HIT` | Trailing Stop Gain | WhatsApp, WebPush |
| `TRADE_ERROR` | Erro no trade | WhatsApp, WebPush |
| `PASSWORD_RESET` | Recuperação de senha | Email |
| `WELCOME` | Boas-vindas | Email |
| `SUBSCRIPTION_ACTIVATED` | Assinatura ativada | Email, WebPush |
| `SUBSCRIPTION_EXPIRING` | Assinatura expirando | Email, WebPush |
| `SUBSCRIPTION_EXPIRED` | Assinatura expirada | Email, WebPush |
| `TEST_MESSAGE` | Mensagem de teste | WhatsApp, Email, WebPush |

## Arquitetura

### Backend

#### Modelo Prisma

```prisma
model NotificationTemplate {
  id             Int      @id @default(autoincrement())
  template_type  String   @db.VarChar(50)
  channel        String   @db.VarChar(20)
  name           String   @db.VarChar(255)
  subject        String?  @db.VarChar(255)
  body           String   @db.Text
  body_html      String?  @db.Text
  icon_url       String?  @db.VarChar(500)
  action_url     String?  @db.VarChar(500)
  variables_json Json?    @db.Json
  is_active      Boolean  @default(true)
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt
  
  @@unique([template_type, channel])
  @@map("notification_templates")
}
```

#### UnifiedTemplateService (`packages/notifications/src/unified-template.service.ts`)

```typescript
class UnifiedTemplateService {
  // Renderização
  renderTemplate(
    templateType: TemplateType,
    channel: NotificationChannel,
    variables: TemplateVariables
  ): Promise<TemplateRenderResult>
  
  // CRUD
  listTemplates(channel?): Promise<TemplateListItem[]>
  getTemplate(templateType, channel): Promise<Template | null>
  saveTemplate(data): Promise<Template>
  resetTemplate(templateType, channel): Promise<boolean>
  
  // Templates Padrão
  getDefaultTemplates(): DefaultTemplates
}
```

#### Endpoints da API

```
GET    /admin/notifications/unified-templates
       Listar todos os templates
       Query: ?channel=whatsapp|email|webpush

GET    /admin/notifications/unified-templates/:type/:channel
       Obter template específico

POST   /admin/notifications/unified-templates
       Salvar/atualizar template
       Body: { templateType, channel, name, subject?, body, bodyHtml?, iconUrl?, actionUrl?, isActive? }

DELETE /admin/notifications/unified-templates/:type/:channel
       Resetar para template padrão

POST   /admin/notifications/unified-templates/:type/:channel/preview
       Preview com dados de exemplo
       Body: { customBody?, customSubject?, variables? }
```

### Frontend

#### UnifiedTemplatesTab (`apps/frontend/src/components/admin/UnifiedTemplatesTab.tsx`)

Componente principal com:
- Tabs de canal (WhatsApp, Email, WebPush)
- Grid de cards de templates
- Filtro por tipo de template
- Badge indicando se é custom ou padrão

#### TemplateEditorDialog

Modal de edição com:
- Campos específicos por canal
- Editor de código para body/HTML
- Lista de variáveis disponíveis (click-to-copy)
- Preview em tempo real

#### Componentes de Preview

- **WhatsAppPreview**: Simula bolha de mensagem do WhatsApp
- **EmailPreview**: Renderiza HTML como preview de email
- **WebPushPreview**: Simula notificação desktop e mobile

## Variáveis

### Sintaxe
As variáveis usam o formato `{nome_variavel}`:

```
Posição {symbol} aberta!
Lucro: ${pnl} ({pnl_pct}%)
```

### Variáveis por Tipo

#### WEBHOOK_RECEIVED
| Variável | Descrição |
|----------|-----------|
| `{symbol}` | Par de trading |
| `{action}` | Ação (BUY/SELL) |
| `{quantity}` | Quantidade |
| `{price}` | Preço |
| `{timeframe}` | Timeframe |
| `{timestamp}` | Data/hora |

#### POSITION_OPENED / POSITION_CLOSED
| Variável | Descrição |
|----------|-----------|
| `{symbol}` | Par de trading |
| `{side}` | LONG/SHORT |
| `{quantity}` | Quantidade |
| `{entry_price}` | Preço de entrada |
| `{exit_price}` | Preço de saída |
| `{pnl}` | Lucro/Prejuízo |
| `{pnl_pct}` | PnL percentual |
| `{account}` | Nome da conta |
| `{timestamp}` | Data/hora |

#### SL_HIT / TP_HIT / SG_HIT / TSG_HIT
| Variável | Descrição |
|----------|-----------|
| `{symbol}` | Par de trading |
| `{pnl}` | Lucro/Prejuízo |
| `{pnl_pct}` | PnL percentual |
| `{sl_price}` | Preço do SL |
| `{tp_price}` | Preço do TP |
| `{sg_price}` | Preço do SG |
| `{max_price}` | Preço máximo (TSG) |
| `{exit_price}` | Preço de saída |
| `{timestamp}` | Data/hora |

#### SUBSCRIPTION_*
| Variável | Descrição |
|----------|-----------|
| `{plan_name}` | Nome do plano |
| `{expires_at}` | Data de expiração |
| `{days_remaining}` | Dias restantes |
| `{timestamp}` | Data/hora |

#### PASSWORD_RESET
| Variável | Descrição |
|----------|-----------|
| `{reset_link}` | Link de reset |
| `{email}` | Email do usuário |
| `{timestamp}` | Data/hora |

## Exemplos de Templates

### WhatsApp - Posição Aberta
```
✅ *Posição Aberta*

Símbolo: {symbol}
Tipo: {side}
Quantidade: {quantity}
Preço: ${entry_price}

📊 Conta: {account}
```

### Email - Posição Fechada (HTML)
```html
<h2>🏁 Posição Fechada</h2>
<p>
  <strong>Símbolo:</strong> {symbol}<br>
  <strong>PnL:</strong> ${pnl} ({pnl_pct}%)<br>
  <strong>Preço entrada:</strong> ${entry_price}<br>
  <strong>Preço saída:</strong> ${exit_price}
</p>
```

### Web Push - Stop Loss
```
Título: SL Atingido: {symbol}
Corpo: PnL: ${pnl} ({pnl_pct}%)
Ícone: /icons/icon-192x192.png
URL: /positions
```

## Herança de Templates

1. **Templates Padrão**: Definidos no código (`DEFAULT_TEMPLATES`)
2. **Templates Customizados**: Salvos no banco (`notification_templates`)

O sistema primeiro busca um template customizado. Se não encontrar, usa o padrão.

### Resetar para Padrão

Para restaurar um template customizado para o padrão:
1. Acesse o editor do template
2. Clique no botão de reset (ícone de rotação)
3. Confirme a ação

Isso remove o registro customizado do banco, fazendo o sistema usar o template padrão novamente.

## Uso Programático

### Enviar Notificação com Template

```typescript
import { UnifiedTemplateService, NotificationService } from '@mvcashnode/notifications';

const templateService = new UnifiedTemplateService(prisma);
const notificationService = new NotificationService(prisma, config);

// Renderizar template
const result = await templateService.renderTemplate(
  'POSITION_OPENED',
  'whatsapp',
  {
    symbol: 'BTCUSDT',
    side: 'LONG',
    quantity: '0.5',
    entry_price: '50000.00',
    account: 'Conta Principal',
    timestamp: new Date().toLocaleString(),
  }
);

// Enviar notificação
await notificationService.send({
  userId: 1,
  channel: 'whatsapp',
  message: result.body,
});
```

## Migração

A tabela `notification_templates` é criada automaticamente pela migração:

```bash
pnpm --filter @mvcashnode/db prisma migrate deploy
```

## Troubleshooting

### Template não aparece customizado
1. Verifique se salvou o template
2. Confirme que `is_active` está true
3. Limpe o cache da aplicação

### Variável não substitui
1. Verifique a sintaxe: `{variavel}` (sem espaços)
2. Confirme que a variável existe no contexto
3. Valores null/undefined são substituídos por string vazia

### Preview não atualiza
1. Clique no botão "Gerar Preview"
2. Verifique erros no console do navegador
3. Recarregue a página

