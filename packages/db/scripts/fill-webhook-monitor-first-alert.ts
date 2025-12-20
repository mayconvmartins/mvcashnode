/**
 * Script para preencher price_first_alert, price_original e replacement_count
 * para alertas existentes no webhook monitor.
 * 
 * Executa a reconstrução recursiva da cadeia de substituições.
 * 
 * Uso: npx tsx packages/db/scripts/fill-webhook-monitor-first-alert.ts
 */

import { PrismaClient } from '@mvcashnode/db';

const prisma = new PrismaClient();

interface Alert {
  id: number;
  price_alert: any;
  price_first_alert: any | null;
  price_original: any | null;
  replacement_count: number;
  replaced_alert_id: number | null;
  state: string;
  side: string;
  execution_price: any | null;
  price_minimum: any | null;
  price_maximum: any | null;
  savings_pct: any | null;
  efficiency_pct: any | null;
}

async function getFirstAlertInChain(alertId: number, visited = new Set<number>()): Promise<number | null> {
  // Prevenir loops infinitos
  if (visited.has(alertId)) {
    console.warn(`⚠️  Loop detectado na cadeia de alerta ${alertId}`);
    return null;
  }
  visited.add(alertId);

  const alert = await prisma.webhookMonitorAlert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      replaced_alert_id: true,
      price_alert: true,
    },
  });

  if (!alert) {
    return null;
  }

  // Se não tem replaced_alert_id, este é o primeiro da cadeia
  if (!alert.replaced_alert_id) {
    return alert.id;
  }

  // Recursivamente buscar o primeiro
  return getFirstAlertInChain(alert.replaced_alert_id, visited);
}

async function rebuildChain(alertId: number): Promise<{
  priceFirstAlert: number;
  replacementCount: number;
} | null> {
  const firstAlertId = await getFirstAlertInChain(alertId);
  if (!firstAlertId) {
    return null;
  }

  const firstAlert = await prisma.webhookMonitorAlert.findUnique({
    where: { id: firstAlertId },
    select: {
      price_alert: true,
    },
  });

  if (!firstAlert) {
    return null;
  }

  // Contar quantos alertas existem na cadeia até o primeiro
  let count = 0;
  let currentId: number | null = alertId;
  const visited = new Set<number>();

  while (currentId && currentId !== firstAlertId && !visited.has(currentId)) {
    visited.add(currentId);
    count++;
    const current = await prisma.webhookMonitorAlert.findUnique({
      where: { id: currentId },
      select: { replaced_alert_id: true },
    });
    currentId = current?.replaced_alert_id || null;
  }

  const priceFirstAlert = firstAlert.price_alert.toNumber();
  return {
    priceFirstAlert,
    replacementCount: count,
  };
}

async function recalculateMetrics(alert: Alert) {
  if (alert.state !== 'EXECUTED' || !alert.execution_price || !alert.price_first_alert) {
    return { savings_pct: alert.savings_pct, efficiency_pct: alert.efficiency_pct };
  }

  const priceFirstAlert = typeof alert.price_first_alert === 'number' 
    ? alert.price_first_alert 
    : alert.price_first_alert.toNumber();
  const executionPrice = typeof alert.execution_price === 'number'
    ? alert.execution_price
    : alert.execution_price.toNumber();

  // Calcular savings_pct usando price_first_alert
  let savingsPct = alert.savings_pct?.toNumber ? alert.savings_pct.toNumber() : (alert.savings_pct || 0);
  if (priceFirstAlert > 0) {
    if (alert.side === 'BUY') {
      savingsPct = ((priceFirstAlert - executionPrice) / priceFirstAlert) * 100;
    } else {
      savingsPct = ((executionPrice - priceFirstAlert) / priceFirstAlert) * 100;
    }
  }

  // Calcular efficiency_pct usando price_first_alert
  let efficiencyPct = alert.efficiency_pct?.toNumber ? alert.efficiency_pct.toNumber() : (alert.efficiency_pct || 0);
  if (alert.side === 'BUY' && alert.price_minimum) {
    const priceMin = typeof alert.price_minimum === 'number' 
      ? alert.price_minimum 
      : alert.price_minimum.toNumber();
    const denominator = priceFirstAlert - priceMin;
    if (Math.abs(denominator) > 0.000001) {
      efficiencyPct = ((priceFirstAlert - executionPrice) / denominator) * 100;
      efficiencyPct = Math.min(100, Math.max(0, efficiencyPct));
    }
  } else if (alert.side === 'SELL' && alert.price_maximum) {
    const priceMax = typeof alert.price_maximum === 'number'
      ? alert.price_maximum
      : alert.price_maximum.toNumber();
    const denominator = priceMax - priceFirstAlert;
    if (Math.abs(denominator) > 0.000001) {
      efficiencyPct = ((executionPrice - priceFirstAlert) / denominator) * 100;
      efficiencyPct = Math.min(100, Math.max(0, efficiencyPct));
    }
  }

  return {
    savings_pct: savingsPct,
    efficiency_pct: efficiencyPct,
  };
}

async function main() {
  console.log('🔄 Iniciando reconstrução de cadeias de substituição...\n');

  // Passo 1: Inicializar campos para alertas que não têm
  console.log('📝 Passo 1: Inicializando campos básicos...');
  const initResult = await prisma.$executeRaw`
    UPDATE webhook_monitor_alerts 
    SET price_original = price_alert,
        price_first_alert = price_alert,
        replacement_count = 0
    WHERE price_original IS NULL OR price_first_alert IS NULL
  `;
  console.log(`   ✅ ${initResult} alertas inicializados\n`);

  // Passo 2: Reconstruir cadeias para alertas que têm replaced_alert_id
  console.log('🔗 Passo 2: Reconstruindo cadeias de substituição...');
  const alertsWithReplacement = await prisma.webhookMonitorAlert.findMany({
    where: {
      replaced_alert_id: { not: null },
    },
    select: {
      id: true,
      price_alert: true,
      price_first_alert: true,
      price_original: true,
      replacement_count: true,
      replaced_alert_id: true,
      state: true,
      side: true,
      execution_price: true,
      price_minimum: true,
      price_maximum: true,
      savings_pct: true,
      efficiency_pct: true,
    },
    orderBy: {
      created_at: 'asc', // Processar do mais antigo ao mais recente
    },
  });

  console.log(`   📊 ${alertsWithReplacement.length} alertas com replaced_alert_id encontrados`);

  let processed = 0;
  let errors = 0;

  for (const alert of alertsWithReplacement) {
    try {
      const chainData = await rebuildChain(alert.id);
      
      if (chainData) {
        const priceAlert = typeof alert.price_alert === 'number'
          ? alert.price_alert
          : alert.price_alert.toNumber();

        // Recalcular métricas se necessário
        const metrics = await recalculateMetrics(alert as any);

        await prisma.webhookMonitorAlert.update({
          where: { id: alert.id },
          data: {
            price_first_alert: chainData.priceFirstAlert,
            price_original: priceAlert,
            replacement_count: chainData.replacementCount,
            savings_pct: alert.state === 'EXECUTED' ? metrics.savings_pct : alert.savings_pct,
            efficiency_pct: alert.state === 'EXECUTED' ? metrics.efficiency_pct : alert.efficiency_pct,
          },
        });

        processed++;
        if (processed % 100 === 0) {
          console.log(`   ⏳ Processados ${processed}/${alertsWithReplacement.length}...`);
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Erro ao processar alerta ${alert.id}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n   ✅ ${processed} alertas processados com sucesso`);
  if (errors > 0) {
    console.log(`   ⚠️  ${errors} erros encontrados`);
  }

  // Passo 3: Recalcular métricas para todos os alertas executados
  console.log('\n📊 Passo 3: Recalculando métricas para alertas executados...');
  const executedAlerts = await prisma.webhookMonitorAlert.findMany({
    where: {
      state: 'EXECUTED',
      price_first_alert: { not: null },
      execution_price: { not: null },
    },
    select: {
      id: true,
      price_first_alert: true,
      execution_price: true,
      side: true,
      price_minimum: true,
      price_maximum: true,
      savings_pct: true,
      efficiency_pct: true,
      state: true,
    },
  });

  let metricsUpdated = 0;
  for (const alert of executedAlerts) {
    try {
      const metrics = await recalculateMetrics(alert as any);
      
      await prisma.webhookMonitorAlert.update({
        where: { id: alert.id },
        data: {
          savings_pct: metrics.savings_pct,
          efficiency_pct: metrics.efficiency_pct,
        },
      });
      
      metricsUpdated++;
    } catch (error: any) {
      console.error(`   ❌ Erro ao recalcular métricas para alerta ${alert.id}: ${error.message}`);
    }
  }

  console.log(`   ✅ ${metricsUpdated} métricas recalculadas\n`);

  console.log('✅ Processo concluído!');
}

main()
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

