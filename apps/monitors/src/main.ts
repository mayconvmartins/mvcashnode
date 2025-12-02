import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  console.log('Monitors service started');
  console.log('Configurando jobs repetitivos...');

  // Configurar SL/TP Monitor REAL - executa a cada 30 segundos
  const slTpRealQueue = app.get<Queue>(getQueueToken('sl-tp-monitor-real'));
  await slTpRealQueue.add(
    'monitor-sl-tp',
    {},
    {
      repeat: {
        every: 30000, // 30 segundos
      },
      jobId: 'sl-tp-monitor-real-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ SL/TP Monitor REAL configurado (a cada 30s)');

  // Configurar SL/TP Monitor SIMULATION - executa a cada 30 segundos
  const slTpSimQueue = app.get<Queue>(getQueueToken('sl-tp-monitor-sim'));
  await slTpSimQueue.add(
    'monitor-sl-tp',
    {},
    {
      repeat: {
        every: 30000, // 30 segundos
      },
      jobId: 'sl-tp-monitor-sim-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ SL/TP Monitor SIMULATION configurado (a cada 30s)');

  // Configurar Limit Orders Monitor REAL - executa a cada 60 segundos
  const limitOrdersRealQueue = app.get<Queue>(getQueueToken('limit-orders-monitor-real'));
  await limitOrdersRealQueue.add(
    'monitor-limit-orders',
    {},
    {
      repeat: {
        every: 60000, // 60 segundos (1 minuto)
      },
      jobId: 'limit-orders-monitor-real-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ Limit Orders Monitor REAL configurado (a cada 60s)');

  // Configurar Limit Orders Monitor SIMULATION - executa a cada 60 segundos
  const limitOrdersSimQueue = app.get<Queue>(getQueueToken('limit-orders-monitor-sim'));
  await limitOrdersSimQueue.add(
    'monitor-limit-orders',
    {},
    {
      repeat: {
        every: 60000, // 60 segundos (1 minuto)
      },
      jobId: 'limit-orders-monitor-sim-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ Limit Orders Monitor SIMULATION configurado (a cada 60s)');

  // Configurar Balances Sync REAL - executa a cada 5 minutos
  const balancesSyncQueue = app.get<Queue>(getQueueToken('balances-sync-real'));
  await balancesSyncQueue.add(
    'sync-balances',
    {},
    {
      repeat: {
        every: 300000, // 5 minutos
      },
      jobId: 'balances-sync-real-repeat',
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  console.log('✅ Balances Sync REAL configurado (a cada 5min)');

  console.log('🎉 Todos os monitores configurados e rodando!');
}

bootstrap().catch((error) => {
  console.error('Erro ao iniciar monitors service:', error);
  process.exit(1);
});

