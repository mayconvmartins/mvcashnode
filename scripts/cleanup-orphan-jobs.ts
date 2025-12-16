#!/usr/bin/env ts-node
/**
 * Script de Limpeza de Jobs Órfãos no Redis
 * 
 * Remove jobs do BullMQ que estão no Redis mas:
 * - Têm status FAILED no banco
 * - Estão no Redis há mais de 1 hora
 * - Estão vinculados a posições já fechadas
 * 
 * Uso:
 *   ts-node scripts/cleanup-orphan-jobs.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

const prisma = new PrismaClient();

interface CleanupStats {
  totalScanned: number;
  failedInDb: number;
  closedPositions: number;
  oldJobs: number;
  removed: number;
  errors: number;
}

async function cleanupOrphanJobs(dryRun = false): Promise<CleanupStats> {
  const stats: CleanupStats = {
    totalScanned: 0,
    failedInDb: 0,
    closedPositions: 0,
    oldJobs: 0,
    removed: 0,
    errors: 0,
  };

  console.log(`🧹 Iniciando limpeza de jobs órfãos (${dryRun ? 'DRY-RUN' : 'EXECUÇÃO REAL'})...`);

  // Conectar ao Redis
  const queue = new Queue('trade-execution-real', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    },
  });

  try {
    // Buscar todos os jobs nas filas
    const [waiting, active, delayed, completed, failed] = await Promise.all([
      queue.getJobs(['waiting']),
      queue.getJobs(['active']),
      queue.getJobs(['delayed']),
      queue.getJobs(['completed']),
      queue.getJobs(['failed']),
    ]);

    const allJobs = [...waiting, ...active, ...delayed, ...completed, ...failed];
    stats.totalScanned = allJobs.length;

    console.log(`📊 Total de jobs encontrados no Redis: ${stats.totalScanned}`);
    console.log(`  - Waiting: ${waiting.length}`);
    console.log(`  - Active: ${active.length}`);
    console.log(`  - Delayed: ${delayed.length}`);
    console.log(`  - Completed: ${completed.length}`);
    console.log(`  - Failed: ${failed.length}`);
    console.log('');

    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();

    for (const job of allJobs) {
      try {
        const tradeJobId = job.data?.tradeJobId;
        if (!tradeJobId) continue;

        // Buscar job no banco
        const dbJob = await prisma.tradeJob.findUnique({
          where: { id: tradeJobId },
          select: {
            id: true,
            status: true,
            position_id_to_close: true,
            created_at: true,
          },
        });

        if (!dbJob) {
          console.log(`⚠️  Job ${tradeJobId} não existe no banco, removendo do Redis...`);
          if (!dryRun) {
            await job.remove();
            stats.removed++;
          }
          continue;
        }

        let shouldRemove = false;
        let reason = '';

        // Critério 1: Job está FAILED no banco
        if (dbJob.status === 'FAILED') {
          shouldRemove = true;
          reason = `status FAILED no banco`;
          stats.failedInDb++;
        }

        // Critério 2: Job está no Redis há mais de 1 hora
        const jobAge = now - job.timestamp;
        if (jobAge > ONE_HOUR) {
          shouldRemove = true;
          reason = `job antigo (${Math.round(jobAge / 1000 / 60)} minutos)`;
          stats.oldJobs++;
        }

        // Critério 3: Posição vinculada já está fechada
        if (dbJob.position_id_to_close) {
          const position = await prisma.tradePosition.findUnique({
            where: { id: dbJob.position_id_to_close },
            select: { status: true, closed_at: true },
          });

          if (position && (position.status === 'CLOSED' || position.closed_at !== null)) {
            shouldRemove = true;
            reason = `posição ${dbJob.position_id_to_close} já está fechada`;
            stats.closedPositions++;
          }
        }

        if (shouldRemove) {
          console.log(`🗑️  Removendo job ${tradeJobId} do Redis: ${reason}`);
          if (!dryRun) {
            await job.remove();
            stats.removed++;
          }
        }
      } catch (error: any) {
        console.error(`❌ Erro ao processar job: ${error.message}`);
        stats.errors++;
      }
    }

    console.log('');
    console.log('✅ Limpeza concluída!');
    console.log('');
    console.log('📈 Estatísticas:');
    console.log(`  - Total escaneado: ${stats.totalScanned}`);
    console.log(`  - Jobs com status FAILED: ${stats.failedInDb}`);
    console.log(`  - Jobs de posições fechadas: ${stats.closedPositions}`);
    console.log(`  - Jobs antigos (>1h): ${stats.oldJobs}`);
    console.log(`  - Jobs removidos: ${stats.removed}`);
    console.log(`  - Erros: ${stats.errors}`);

    if (dryRun && stats.removed > 0) {
      console.log('');
      console.log('⚠️  Execute sem --dry-run para remover os jobs de fato');
    }
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }

  return stats;
}

// Executar script
const dryRun = process.argv.includes('--dry-run');
cleanupOrphanJobs(dryRun).catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});

