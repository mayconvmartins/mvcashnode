import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultTemplates = [
  {
    template_type: 'WEBHOOK_RECEIVED',
    name: 'Webhook Recebido - Padrão',
    body: `{emoji} *Webhook Recebido*

📡 Fonte: *{source.label}*
💱 Par: *{symbol}*
📊 Ação: *{action}*
💵 Preço: ${'{price}'}         [se disponível]
⏱️ Timeframe: {timeframe}  [se disponível]

📝 *Texto Original:*
_{originalText}_

🕐 {datetime}`,
    variables_json: {
      available: ['source.label', 'symbol', 'action', 'price', 'timeframe', 'originalText', 'datetime', 'emoji'],
      description: {
        'source.label': 'Nome da fonte do webhook',
        'symbol': 'Símbolo do par (ex: SOLUSDT)',
        'action': 'Ação do sinal (BUY/SELL)',
        'price': 'Preço de referência',
        'timeframe': 'Timeframe do sinal (ex: H1)',
        'originalText': 'Texto original recebido',
        'datetime': 'Data e hora atual',
        'emoji': 'Emoji baseado na ação (🟢/🔴)',
      },
    },
    is_active: true,
  },
  {
    template_type: 'TEST_MESSAGE',
    name: 'Mensagem de Teste - Padrão',
    body: `✅ *Teste de Notificação*

Seu sistema de notificações WhatsApp está configurado corretamente!

Instância: {instanceName}
Horário: {datetime}`,
    variables_json: {
      available: ['instanceName', 'datetime'],
      description: {
        'instanceName': 'Nome da instância da Evolution API',
        'datetime': 'Data e hora atual',
      },
    },
    is_active: true,
  },
  {
    template_type: 'POSITION_OPENED',
    name: 'Posição Aberta - Padrão',
    body: `🟢 *Nova Posição Aberta*

👤 Conta: {account.label}    [apenas para admins]
💱 Par: *{symbol}*
📦 Posição: {position.idShort}

📊 Quantidade: {qty}
💵 Preço Médio: ${'{avgPrice}'}
💰 Investido: ${'{total}'} USDT
💸 Comissão: {commission} {commissionAsset}   [se disponível]
🔄 {autoAdjusted}  [se aplicável]

🕐 {datetime}`,
    variables_json: {
      available: ['account.label', 'symbol', 'position.id', 'position.idShort', 'qty', 'avgPrice', 'total', 'commission', 'commissionAsset', 'autoAdjusted', 'datetime'],
      description: {
        'account.label': 'Nome da conta de exchange',
        'symbol': 'Símbolo do par',
        'position.id': 'ID completo da posição',
        'position.idShort': 'ID curto da posição (ex: POS-A1B2C3D4)',
        'qty': 'Quantidade da posição',
        'avgPrice': 'Preço médio de entrada',
        'total': 'Valor total investido',
        'commission': 'Comissão paga',
        'commissionAsset': 'Ativo da comissão (ex: BNB)',
        'autoAdjusted': 'Texto sobre auto-ajuste',
        'datetime': 'Data e hora da criação',
      },
    },
    is_active: true,
  },
  {
    template_type: 'POSITION_CLOSED',
    name: 'Posição Fechada - Padrão',
    body: `🔴 *Posição Fechada - LUCRO/PREJUÍZO*

👤 Conta: {account.label}    [apenas para admins]
💱 Par: *{symbol}*
📦 Posição: {position.idShort}

📊 *COMPRA*
├ Quantidade: {buyQty}
├ Preço Médio: ${'{buyAvgPrice}'}
└ Total: ${'{buyTotal}'} USDT

📈 *VENDA*
├ Quantidade: {sellQty}
├ Preço Médio: ${'{sellAvgPrice}'}
└ Total: ${'{sellTotal}'} USDT

💹 *RESULTADO*
├ ROI: {profitPct}%
├ Lucro/Prejuízo: {profit} USDT
└ Duração: {duration}

{closeReason}

🕐 {datetime}`,
    variables_json: {
      available: ['account.label', 'symbol', 'position.id', 'position.idShort', 'buyQty', 'buyAvgPrice', 'buyTotal', 'sellQty', 'sellAvgPrice', 'sellTotal', 'profitPct', 'profit', 'duration', 'closeReason', 'datetime'],
      description: {
        'account.label': 'Nome da conta de exchange',
        'symbol': 'Símbolo do par',
        'position.id': 'ID completo da posição',
        'position.idShort': 'ID curto da posição',
        'buyQty': 'Quantidade comprada',
        'buyAvgPrice': 'Preço médio de compra',
        'buyTotal': 'Total investido',
        'sellQty': 'Quantidade vendida',
        'sellAvgPrice': 'Preço médio de venda',
        'sellTotal': 'Total recebido',
        'profitPct': 'Percentual de lucro/prejuízo',
        'profit': 'Lucro/prejuízo em USDT',
        'duration': 'Duração da posição',
        'closeReason': 'Motivo do fechamento',
        'datetime': 'Data e hora do fechamento',
      },
    },
    is_active: true,
  },
  {
    template_type: 'STOP_LOSS_TRIGGERED',
    name: 'Stop Loss Acionado - Padrão',
    body: `🛑 *Stop Loss Acionado*

👤 Conta: {account.label}    [apenas para admins]
💱 Par: *{symbol}*
🔴 Lado: VENDA
🛑 SL (parâmetro)

📦 {position.idShort}
Qty: {qty}
{profitPct}%
💰 Preço: ${'{sellPrice}'}
💵 Total: ${'{total}'}

⚠️ Proteção ativada
Limite: {limitPct}%
🕐 {datetime}`,
    variables_json: {
      available: ['account.label', 'symbol', 'position.id', 'position.idShort', 'qty', 'profitPct', 'sellPrice', 'total', 'limitPct', 'datetime'],
      description: {
        'account.label': 'Nome da conta de exchange',
        'symbol': 'Símbolo do par',
        'position.id': 'ID completo da posição',
        'position.idShort': 'ID curto da posição',
        'qty': 'Quantidade vendida',
        'profitPct': 'Percentual de lucro/prejuízo',
        'sellPrice': 'Preço de venda',
        'total': 'Total recebido',
        'limitPct': 'Percentual do limite de SL',
        'datetime': 'Data e hora atual',
      },
    },
    is_active: true,
  },
  {
    template_type: 'PARTIAL_TP_TRIGGERED',
    name: 'Take Profit Parcial - Padrão',
    body: `💰 *Take Profit Parcial*

👤 Conta: {account.label}    [apenas para admins]
💱 Par: *{symbol}*
🔴 Lado: VENDA PARCIAL
🎯 Partial TP

📦 {position.idShort}
Qty vendida: {qtySold}
Restante: {qtyRemaining}
{profitPct}%
💰 Preço: ${'{sellPrice}'}
💵 Total: ${'{total}'}

✅ Lucro parcial realizado
🕐 {datetime}`,
    variables_json: {
      available: ['account.label', 'symbol', 'position.id', 'position.idShort', 'qtySold', 'qtyRemaining', 'profitPct', 'sellPrice', 'total', 'datetime'],
      description: {
        'account.label': 'Nome da conta de exchange',
        'symbol': 'Símbolo do par',
        'position.id': 'ID completo da posição',
        'position.idShort': 'ID curto da posição',
        'qtySold': 'Quantidade vendida parcialmente',
        'qtyRemaining': 'Quantidade restante na posição',
        'profitPct': 'Percentual de lucro',
        'sellPrice': 'Preço de venda',
        'total': 'Total recebido',
        'datetime': 'Data e hora atual',
      },
    },
    is_active: true,
  },
];

async function main() {
  console.log('🌱 Inserindo templates padrão de notificação WhatsApp...');

  for (const template of defaultTemplates) {
    try {
      // Verificar se já existe template ativo deste tipo usando SQL direto
      const existing = await prisma.$queryRaw<any[]>`
        SELECT * FROM whatsapp_notification_templates 
        WHERE template_type = ${template.template_type} 
        AND is_active = true 
        LIMIT 1
      `;

      if (existing && existing.length > 0) {
        console.log(`⏭️  Template ${template.template_type} já existe, pulando...`);
        continue;
      }

      // Desativar outros templates do mesmo tipo
      await prisma.$executeRaw`
        UPDATE whatsapp_notification_templates 
        SET is_active = false 
        WHERE template_type = ${template.template_type}
      `;

      // Criar novo template usando SQL direto
      await prisma.$executeRaw`
        INSERT INTO whatsapp_notification_templates 
        (template_type, name, subject, body, variables_json, is_active, created_at, updated_at)
        VALUES (
          ${template.template_type},
          ${template.name},
          NULL,
          ${template.body},
          ${JSON.stringify(template.variables_json)},
          ${template.is_active},
          NOW(),
          NOW()
        )
      `;

      console.log(`✅ Template ${template.template_type} criado`);
    } catch (error: any) {
      // Se a tabela não existir ainda, tentar usar Prisma Client (se regenerado)
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('não existe')) {
        console.warn(`⚠️  Tabela ainda não existe. Execute a migration primeiro: npx prisma migrate dev`);
        break;
      }
      
      // Tentar usar Prisma Client como fallback
      try {
        // @ts-ignore - Prisma client pode não estar regenerado
        const existing = await (prisma as any).whatsAppNotificationTemplate?.findFirst({
          where: {
            template_type: template.template_type,
            is_active: true,
          },
        });

        if (existing) {
          console.log(`⏭️  Template ${template.template_type} já existe, pulando...`);
          continue;
        }

        // @ts-ignore
        await (prisma as any).whatsAppNotificationTemplate?.updateMany({
          where: {
            template_type: template.template_type,
          },
          data: {
            is_active: false,
          },
        });

        // @ts-ignore
        await (prisma as any).whatsAppNotificationTemplate?.create({
          data: template,
        });

        console.log(`✅ Template ${template.template_type} criado`);
      } catch (fallbackError: any) {
        console.error(`❌ Erro ao criar template ${template.template_type}:`, fallbackError.message);
      }
    }
  }

  console.log('✨ Seed de templates concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

