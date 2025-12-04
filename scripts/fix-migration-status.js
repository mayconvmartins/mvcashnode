#!/usr/bin/env node
/**
 * Script para corrigir o status de uma migration falhada no Prisma
 * Uso: node scripts/fix-migration-status.js <nome_da_migration>
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMigrationStatus(migrationName) {
  try {
    // Verificar estado atual
    const migration = await prisma.$queryRaw`
      SELECT * FROM _prisma_migrations 
      WHERE migration_name = ${migrationName}
    `;

    console.log('Estado atual da migration:');
    console.log(migration);

    // Atualizar status se estiver falhada
    const result = await prisma.$executeRaw`
      UPDATE _prisma_migrations 
      SET finished_at = NOW(),
          logs = NULL
      WHERE migration_name = ${migrationName}
        AND finished_at IS NULL
    `;

    if (result > 0) {
      console.log(`✅ Migration ${migrationName} marcada como aplicada com sucesso!`);
    } else {
      console.log(`ℹ️  Migration ${migrationName} já está com status correto ou não encontrada.`);
    }

    // Verificar estado final
    const finalState = await prisma.$queryRaw`
      SELECT * FROM _prisma_migrations 
      WHERE migration_name = ${migrationName}
    `;
    
    console.log('\nEstado final:');
    console.log(finalState);

  } catch (error) {
    console.error('Erro ao corrigir migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const migrationName = process.argv[2];
if (!migrationName) {
  console.error('Uso: node scripts/fix-migration-status.js <nome_da_migration>');
  console.error('Exemplo: node scripts/fix-migration-status.js 20251204075531_');
  process.exit(1);
}

fixMigrationStatus(migrationName);

