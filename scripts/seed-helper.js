#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env from root
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n');
  
  envLines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

// First, check if Prisma Client is already generated
// Prisma Client is generated in root node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client
const rootDir = path.resolve(__dirname, '..');
const prismaClientPath1 = path.resolve(rootDir, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client', 'index.js');
const prismaClientPath2 = path.resolve(rootDir, 'packages', 'db', 'node_modules', '.prisma', 'client', 'index.js');
const prismaClientExists = fs.existsSync(prismaClientPath1) || fs.existsSync(prismaClientPath2);

if (!prismaClientExists) {
  console.log('🔧 Gerando Prisma Client...');
  try {
    execSync('pnpm db:generate', { stdio: 'inherit', env: process.env, cwd: rootDir });
  } catch (error) {
    console.warn('⚠️  Aviso: Erro ao gerar Prisma Client (pode estar em uso).');
    console.warn('   Tentando continuar mesmo assim...');
    // Don't exit, try to continue - maybe it's already generated
  }
} else {
  console.log('✅ Prisma Client já está gerado.');
}

// Execute seed with tsx
// The Prisma Client is generated in the root node_modules, so we need to run from root
const seedPath = path.resolve(__dirname, 'seed.ts');

// Build NODE_PATH to include root node_modules where Prisma Client is generated
// Also include packages/domain/node_modules for bcrypt
const rootNodeModules = path.resolve(rootDir, 'node_modules');
const dbNodeModules = path.resolve(rootDir, 'packages', 'db', 'node_modules');
const domainNodeModules = path.resolve(rootDir, 'packages', 'domain', 'node_modules');
const pnpmPrismaPath = path.resolve(rootDir, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules');
// pnpm stores packages in .pnpm, so we need to include that too
const pnpmPath = path.resolve(rootDir, 'node_modules', '.pnpm');

// Add all possible paths to NODE_PATH
const nodePathParts = [
  rootNodeModules,
  dbNodeModules,
  domainNodeModules,
  pnpmPrismaPath,
  pnpmPath,
  process.env.NODE_PATH || ''
].filter(p => p);

const nodePath = nodePathParts.join(process.platform === 'win32' ? ';' : ':');

// Use tsx to execute the seed script
const command = `npx --yes tsx "${seedPath}"`;

try {
  // Execute from root directory with NODE_PATH set
  execSync(command, { 
    stdio: 'inherit', 
    env: { ...process.env, NODE_PATH: nodePath },
    cwd: rootDir
  });
} catch (error) {
  process.exit(error.status || 1);
}

