#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const errors = [];

// Lista de pacotes e apps para verificar
const packages = [
  { name: '@mvcashnode/db', path: 'packages/db' },
  { name: '@mvcashnode/shared', path: 'packages/shared' },
  { name: '@mvcashnode/domain', path: 'packages/domain' },
  { name: '@mvcashnode/exchange', path: 'packages/exchange' },
  { name: '@mvcashnode/notifications', path: 'packages/notifications' },
  { name: '@mvcashnode/api', path: 'apps/api' },
  { name: '@mvcashnode/executor', path: 'apps/executor' },
  { name: '@mvcashnode/monitors', path: 'apps/monitors' },
  { name: '@mvcashnode/frontend', path: 'apps/frontend' },
];

console.log('🔍 Verificando erros de build em todos os pacotes...\n');

// Função para executar build e capturar erros
function checkPackage(pkg) {
  const pkgPath = path.join(rootDir, pkg.path);
  const packageJsonPath = path.join(pkgPath, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log(`⚠️  ${pkg.name}: package.json não encontrado, pulando...\n`);
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const buildScript = packageJson.scripts?.build;

  if (!buildScript) {
    console.log(`⚠️  ${pkg.name}: script de build não encontrado, pulando...\n`);
    return;
  }

  console.log(`📦 Verificando ${pkg.name}...`);
  
  try {
    const output = execSync(buildScript, {
      cwd: pkgPath,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
      encoding: 'utf8',
    });
    console.log(`✅ ${pkg.name}: OK\n`);
  } catch (error) {
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    const errorOutput = stdout || stderr || error.message;
    errors.push({
      package: pkg.name,
      path: pkg.path,
      error: errorOutput,
    });
    console.log(`❌ ${pkg.name}: ERROS ENCONTRADOS\n`);
  }
}

// Executar verificação em todos os pacotes
packages.forEach(checkPackage);

// Exibir resumo
console.log('\n' + '='.repeat(80));
console.log('📊 RESUMO DE ERROS');
console.log('='.repeat(80) + '\n');

if (errors.length === 0) {
  console.log('✅ Nenhum erro encontrado! Todos os pacotes compilaram com sucesso.\n');
  process.exit(0);
} else {
  console.log(`❌ ${errors.length} pacote(s) com erros:\n`);
  
  errors.forEach((err, index) => {
    console.log(`${index + 1}. ${err.package} (${err.path})`);
    console.log('-'.repeat(80));
    console.log(err.error);
    console.log('\n');
  });
  
  console.log('='.repeat(80));
  console.log(`\n❌ Total: ${errors.length} pacote(s) com erros de build.\n`);
  process.exit(1);
}

