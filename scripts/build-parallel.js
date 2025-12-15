#!/usr/bin/env node

/**
 * Build paralelo otimizado para servidores com múltiplos núcleos
 * 
 * Este script organiza o build em ondas baseadas em dependências:
 * - Onda 1: Pacotes base (db, shared)
 * - Onda 2: Pacotes intermediários (domain, exchange, notifications)
 * - Onda 3: Apps (api, executor, monitors, backup)
 * - Onda 4: Frontend apps (frontend, site)
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const cpuCount = os.cpus().length;
console.log(`🚀 Build paralelo otimizado para ${cpuCount} núcleos\n`);

// Definir ondas de build baseadas em dependências
const buildWaves = [
  {
    name: 'Onda 1: Pacotes Base',
    packages: ['@mvcashnode/db', '@mvcashnode/shared'],
    parallel: true,
  },
  {
    name: 'Onda 2: Pacotes Intermediários',
    packages: ['@mvcashnode/domain', '@mvcashnode/exchange', '@mvcashnode/notifications'],
    parallel: true,
  },
  {
    name: 'Onda 3: Backend Apps',
    packages: ['@mvcashnode/api', '@mvcashnode/executor', '@mvcashnode/monitors', '@mvcashnode/backup'],
    parallel: true,
  },
  {
    name: 'Onda 4: Frontend Apps',
    packages: ['@mvcashnode/frontend', '@mvcashnode/site'],
    parallel: true,
  },
];

const startTime = Date.now();
let totalPackages = 0;
let successCount = 0;
let errorCount = 0;

function buildWave(wave) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 ${wave.name}`);
  console.log(`${'='.repeat(80)}\n`);

  totalPackages += wave.packages.length;

  if (wave.parallel) {
    // Build paralelo usando pnpm
    const filters = wave.packages.map(pkg => `--filter "${pkg}"`).join(' ');
    const cmd = `pnpm ${filters} --parallel build`;
    
    console.log(`🔨 Executando: ${cmd}\n`);
    
    try {
      execSync(cmd, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          // Otimizações do Node.js para builds
          NODE_OPTIONS: '--max-old-space-size=4096',
        },
      });
      successCount += wave.packages.length;
      console.log(`\n✅ ${wave.name} concluída!\n`);
    } catch (error) {
      errorCount += wave.packages.length;
      console.error(`\n❌ Erro em ${wave.name}\n`);
      throw error;
    }
  } else {
    // Build sequencial (se necessário)
    for (const pkg of wave.packages) {
      console.log(`🔨 Building ${pkg}...`);
      try {
        execSync(`pnpm --filter "${pkg}" build`, {
          stdio: 'inherit',
          cwd: path.resolve(__dirname, '..'),
        });
        successCount++;
        console.log(`✅ ${pkg} OK\n`);
      } catch (error) {
        errorCount++;
        console.error(`❌ ${pkg} FAILED\n`);
        throw error;
      }
    }
  }
}

// Executar builds
try {
  console.log('🏗️  Iniciando build paralelo otimizado...\n');
  
  for (const wave of buildWaves) {
    buildWave(wave);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(80));
  console.log('✨ BUILD COMPLETO ✨');
  console.log('='.repeat(80));
  console.log(`✅ ${successCount}/${totalPackages} pacotes compilados com sucesso`);
  console.log(`⏱️  Tempo total: ${duration}s`);
  console.log(`🚀 Aproveitando ${cpuCount} núcleos de CPU`);
  console.log('='.repeat(80) + '\n');
  
  process.exit(0);
} catch (error) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.error('\n' + '='.repeat(80));
  console.error('❌ BUILD FALHOU');
  console.error('='.repeat(80));
  console.error(`✅ ${successCount} pacotes OK`);
  console.error(`❌ ${errorCount} pacotes com erro`);
  console.error(`⏱️  Tempo até falha: ${duration}s`);
  console.error('='.repeat(80) + '\n');
  
  process.exit(1);
}

