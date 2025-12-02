import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // 1. Criar usuário admin
  console.log('📝 Criando usuário admin...');
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password_hash: adminPassword,
      is_active: true,
      must_change_password: false,
      roles: {
        create: {
          role: 'admin',
        },
      },
      profile: {
        create: {
          full_name: 'Administrador',
          phone: '+5511999999999',
          whatsapp_phone: '+5511999999999',
          position_alerts_enabled: true,
          twofa_enabled: false,
        },
      },
    },
    include: {
      roles: true,
      profile: true,
    },
  });
  console.log('✅ Usuário admin criado:', admin.email);

  // 2. Criar usuário de teste
  console.log('📝 Criando usuário de teste...');
  const userPassword = await bcrypt.hash('User@123', 10);
  const testUser = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password_hash: userPassword,
      is_active: true,
      must_change_password: false,
      roles: {
        create: {
          role: 'user',
        },
      },
      profile: {
        create: {
          full_name: 'Usuário Teste',
          phone: '+5511888888888',
          whatsapp_phone: '+5511888888888',
          position_alerts_enabled: true,
          twofa_enabled: false,
        },
      },
    },
    include: {
      roles: true,
      profile: true,
    },
  });
  console.log('✅ Usuário de teste criado:', testUser.email);

  // 3. Criar contas de exchange para o usuário de teste
  console.log('📝 Criando contas de exchange...');
  const binanceSpotAccount = await prisma.exchangeAccount.upsert({
    where: {
      id: 1,
    },
    update: {},
    create: {
      user_id: testUser.id,
      exchange: 'BINANCE_SPOT',
      label: 'Binance Spot - Teste',
      is_simulation: true,
      testnet: false,
      is_active: true,
      initial_balances_json: {
        USDT: 10000,
        BTC: 0.5,
        ETH: 5,
      },
    },
  });
  console.log('✅ Conta Binance Spot criada:', binanceSpotAccount.id);

  const binanceFuturesAccount = await prisma.exchangeAccount.upsert({
    where: {
      id: 2,
    },
    update: {},
    create: {
      user_id: testUser.id,
      exchange: 'BINANCE_FUTURES',
      label: 'Binance Futures - Teste',
      is_simulation: true,
      testnet: false,
      is_active: true,
      initial_balances_json: {
        USDT: 5000,
      },
    },
  });
  console.log('✅ Conta Binance Futures criada:', binanceFuturesAccount.id);

  // 4. Criar cofres
  console.log('📝 Criando cofres...');
  const vaultReal = await prisma.vault.upsert({
    where: {
      id: 1,
    },
    update: {},
    create: {
      user_id: testUser.id,
      name: 'Cofre Principal - Real',
      description: 'Cofre para trading real',
      trade_mode: 'REAL',
      is_active: true,
      balances: {
        create: [
          {
            asset: 'USDT',
            balance: 5000,
            reserved: 0,
          },
          {
            asset: 'BTC',
            balance: 0.1,
            reserved: 0,
          },
        ],
      },
    },
    include: {
      balances: true,
    },
  });
  console.log('✅ Cofre Real criado:', vaultReal.id);

  const vaultSimulation = await prisma.vault.upsert({
    where: {
      id: 2,
    },
    update: {},
    create: {
      user_id: testUser.id,
      name: 'Cofre Simulação',
      description: 'Cofre para trading simulado',
      trade_mode: 'SIMULATION',
      is_active: true,
      balances: {
        create: [
          {
            asset: 'USDT',
            balance: 10000,
            reserved: 0,
          },
        ],
      },
    },
    include: {
      balances: true,
    },
  });
  console.log('✅ Cofre Simulação criado:', vaultSimulation.id);

  // 5. Criar parâmetros de trading
  console.log('📝 Criando parâmetros de trading...');
  const tradeParam1 = await prisma.tradeParameter.create({
    data: {
      user_id: testUser.id,
      exchange_account_id: binanceSpotAccount.id,
      symbol: 'BTC/USDT',
      side: 'BOTH',
      quote_amount_pct_balance: 10.0,
      max_orders_per_hour: 5,
      min_interval_sec: 300,
      order_type_default: 'MARKET',
      slippage_bps: 10,
      default_sl_enabled: true,
      default_sl_pct: 2.0,
      default_tp_enabled: true,
      default_tp_pct: 5.0,
      trailing_stop_enabled: false,
      vault_id: vaultSimulation.id,
    },
  });
  console.log('✅ Parâmetro de trading criado:', tradeParam1.id);

  const tradeParam2 = await prisma.tradeParameter.create({
    data: {
      user_id: testUser.id,
      exchange_account_id: binanceSpotAccount.id,
      symbol: 'ETH/USDT',
      side: 'BUY',
      quote_amount_fixed: 100,
      max_orders_per_hour: 3,
      min_interval_sec: 600,
      order_type_default: 'LIMIT',
      slippage_bps: 5,
      default_sl_enabled: true,
      default_sl_pct: 3.0,
      default_tp_enabled: false,
      trailing_stop_enabled: true,
      trailing_distance_pct: 1.5,
      vault_id: vaultSimulation.id,
    },
  });
  console.log('✅ Parâmetro de trading criado:', tradeParam2.id);

  // 6. Criar webhook source
  console.log('📝 Criando webhook source...');
  const webhookSource = await prisma.webhookSource.create({
    data: {
      owner_user_id: testUser.id,
      label: 'Webhook Teste',
      webhook_code: 'test-webhook-001',
      trade_mode: 'SIMULATION',
      require_signature: false,
      rate_limit_per_min: 60,
      is_active: true,
      admin_locked: false,
      bindings: {
        create: {
          exchange_account_id: binanceSpotAccount.id,
          is_active: true,
          weight: 1.0,
        },
      },
    },
    include: {
      bindings: true,
    },
  });
  console.log('✅ Webhook source criado:', webhookSource.webhook_code);

  // 7. Criar algumas posições de exemplo
  console.log('📝 Criando posições de exemplo...');
  const tradeJob1 = await prisma.tradeJob.create({
    data: {
      exchange_account_id: binanceSpotAccount.id,
      trade_mode: 'SIMULATION',
      symbol: 'BTC/USDT',
      side: 'BUY',
      order_type: 'MARKET',
      quote_amount: 1000,
      status: 'COMPLETED',
      reason_code: 'WEBHOOK_SIGNAL',
    },
  });

  const execution1 = await prisma.tradeExecution.create({
    data: {
      trade_job_id: tradeJob1.id,
      exchange_account_id: binanceSpotAccount.id,
      trade_mode: 'SIMULATION',
      exchange: 'BINANCE_SPOT',
      client_order_id: `test-${Date.now()}`,
      status_exchange: 'FILLED',
      executed_qty: 0.02,
      cumm_quote_qty: 1000,
      avg_price: 50000,
    },
  });

  const position1 = await prisma.tradePosition.create({
    data: {
      exchange_account_id: binanceSpotAccount.id,
      trade_mode: 'SIMULATION',
      symbol: 'BTC/USDT',
      side: 'LONG',
      trade_job_id_open: tradeJob1.id,
      qty_total: 0.02,
      qty_remaining: 0.02,
      price_open: 50000,
      status: 'OPEN',
      sl_enabled: true,
      sl_pct: 2.0,
      tp_enabled: true,
      tp_pct: 5.0,
      fills: {
        create: {
          trade_execution_id: execution1.id,
          side: 'BUY',
          qty: 0.02,
          price: 50000,
        },
      },
    },
  });
  console.log('✅ Posição criada:', position1.id);

  // 8. Criar histórico de login
  console.log('📝 Criando histórico de login...');
  await prisma.loginHistory.createMany({
    data: [
      {
        user_id: admin.id,
        ip: '127.0.0.1',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        success: true,
      },
      {
        user_id: testUser.id,
        ip: '192.168.1.100',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        success: true,
      },
    ],
  });
  console.log('✅ Histórico de login criado');

  // 9. Criar cache de saldos
  console.log('📝 Criando cache de saldos...');
  await prisma.accountBalanceCache.createMany({
    data: [
      {
        exchange_account_id: binanceSpotAccount.id,
        trade_mode: 'SIMULATION',
        asset: 'USDT',
        free: 9000,
        locked: 1000,
      },
      {
        exchange_account_id: binanceSpotAccount.id,
        trade_mode: 'SIMULATION',
        asset: 'BTC',
        free: 0.48,
        locked: 0.02,
      },
      {
        exchange_account_id: binanceFuturesAccount.id,
        trade_mode: 'SIMULATION',
        asset: 'USDT',
        free: 5000,
        locked: 0,
      },
    ],
  });
  console.log('✅ Cache de saldos criado');

  console.log('\n✨ Seed concluído com sucesso!');
  console.log('\n📋 Credenciais de acesso:');
  console.log('   Admin:');
  console.log('     Email: admin@example.com');
  console.log('     Senha: Admin@123');
  console.log('   Usuário:');
  console.log('     Email: user@example.com');
  console.log('     Senha: User@123');
  console.log('\n🔗 Webhook de teste:');
  console.log(`   Code: ${webhookSource.webhook_code}`);
  console.log(`   URL: http://localhost:4010/webhooks/${webhookSource.webhook_code}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

