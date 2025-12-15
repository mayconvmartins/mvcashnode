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
  { name: '@mvcashnode/backup', path: 'apps/backup' },
  { name: '@mvcashnode/frontend', path: 'apps/frontend' },
  { name: '@mvcashnode/site', path: 'apps/site' },
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
  
  // Para Next.js, limpar lock file antes de executar build
  if (pkg.name === '@mvcashnode/frontend') {
    const lockFile = path.join(pkgPath, '.next', 'lock');
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch (e) {
        // Ignorar erro se não conseguir remover
      }
    }
  }
  
  try {
    const output = execSync(buildScript, {
      cwd: pkgPath,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer para capturar saídas longas
    });
    console.log(`✅ ${pkg.name}: OK\n`);
  } catch (error) {
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    // Combinar stdout e stderr, priorizando stderr se existir
    let errorOutput = stderr || stdout || error.message;
    
    // Para Next.js, extrair e formatar melhor os erros
    if (pkg.name === '@mvcashnode/frontend') {
      // Se o erro é apenas sobre lock file, tentar novamente após limpar
      if (errorOutput.includes('Unable to acquire lock') && !errorOutput.includes('Error occurred')) {
        const lockFile = path.join(pkgPath, '.next', 'lock');
        if (fs.existsSync(lockFile)) {
          try {
            fs.unlinkSync(lockFile);
            // Tentar novamente após limpar lock
            try {
              const retryOutput = execSync(buildScript, {
                cwd: pkgPath,
                stdio: 'pipe',
                env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
              });
              console.log(`✅ ${pkg.name}: OK (após limpar lock)\n`);
              return; // Sucesso na segunda tentativa
            } catch (retryError) {
              // Usar o erro da segunda tentativa
              const retryStdout = retryError.stdout?.toString() || '';
              const retryStderr = retryError.stderr?.toString() || '';
              errorOutput = retryStderr || retryStdout || retryError.message;
            }
          } catch (e) {
            // Se não conseguir limpar, continuar com erro original
          }
        }
      }
      
      const lines = errorOutput.split('\n');
      const errorMessages = [];
      let currentError = null;
      
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // Ignorar mensagens de lock file se já tentamos limpar
        if (trimmed.includes('Unable to acquire lock') || trimmed.includes('another instance')) {
          return; // Pular esta linha
        }
        
        // Detectar início de erro do Next.js
        if (trimmed.includes('⨯') || trimmed.includes('Error occurred') || trimmed.includes('Export encountered') || trimmed.includes('Error:')) {
          if (currentError) {
            errorMessages.push(currentError);
          }
          currentError = { message: trimmed, details: [] };
        }
        // Detectar mensagens de erro importantes
        else if (trimmed.includes('useSearchParams') || 
                 trimmed.includes('should be wrapped') ||
                 trimmed.includes('Suspense') ||
                 trimmed.includes('prerender') ||
                 trimmed.includes('page "') ||
                 trimmed.includes('Event handlers cannot be passed') ||
                 trimmed.includes('Client Component') ||
                 trimmed.includes('digest:') ||
                 (trimmed.startsWith('/') && (trimmed.includes(':') || trimmed.includes('/page'))) ||
                 (trimmed.match(/^\s*at\s+\w+/) && trimmed.includes('apps/frontend'))) {
          if (currentError) {
            currentError.details.push(trimmed);
          } else {
            errorMessages.push({ message: trimmed, details: [] });
          }
        }
        // Adicionar stack trace relevante
        else if (currentError && (trimmed.includes('apps/frontend') || trimmed.match(/^\s*at\s+/))) {
          currentError.details.push(trimmed);
        }
      });
      
      if (currentError) {
        errorMessages.push(currentError);
      }
      
      if (errorMessages.length > 0) {
        errorOutput = errorMessages.map(err => {
          let output = err.message;
          if (err.details.length > 0) {
            // Limitar detalhes a 15 linhas por erro
            const details = err.details.slice(0, 15);
            output += '\n' + details.join('\n');
            if (err.details.length > 15) {
              output += `\n... (${err.details.length - 15} linhas adicionais)`;
            }
          }
          return output;
        }).join('\n\n');
      } else if (errorOutput.includes('Unable to acquire lock')) {
        // Se só tem erro de lock e não conseguimos limpar, mostrar mensagem útil
        errorOutput = '⨯ Lock file detectado. Execute: rm -rf apps/frontend/.next/lock\n   Ou aguarde o build anterior terminar.';
      }
    }
    
    // Limitar tamanho total do erro para não sobrecarregar a saída
    if (errorOutput.length > 10000) {
      errorOutput = errorOutput.substring(0, 10000) + '\n\n... (erro truncado, execute o build individual para ver completo)';
    }
    
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
    console.log(`\n${index + 1}. ${err.package} (${err.path})`);
    console.log('─'.repeat(80));
    console.log(err.error);
    console.log('─'.repeat(80));
  });
  
  console.log('='.repeat(80));
  console.log(`\n❌ Total: ${errors.length} pacote(s) com erros de build.\n`);
  console.log('💡 Dica: Execute o build individual de cada pacote para ver erros completos.\n');
  process.exit(1);
}

