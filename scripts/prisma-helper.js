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

// Get command from args
const args = process.argv.slice(2);
const command = args.join(' ');

// Check if NODE_ENV is production or if --skip-reset flag is provided
const isProduction = process.env.NODE_ENV === 'production';
const skipReset = args.includes('--skip-reset') || args.includes('--create-only');

// For migrate dev commands, warn about potential database reset
if (command.includes('prisma migrate dev') && !skipReset && !isProduction) {
  console.log('\n⚠️  ATENÇÃO: Este comando pode resetar o banco se houver drift.');
  console.log('   Para evitar reset, use: pnpm db:migrate:create --name <nome>');
  console.log('   Ou em produção: pnpm db:migrate:deploy\n');
}

let finalCommand = command;

// Change to packages/db directory
process.chdir(path.resolve(__dirname, '..', 'packages', 'db'));

// Execute command
try {
  execSync(finalCommand, { stdio: 'inherit', env: process.env });
} catch (error) {
  process.exit(error.status || 1);
}

