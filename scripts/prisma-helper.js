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
const command = process.argv.slice(2).join(' ');

// Change to packages/db directory
process.chdir(path.resolve(__dirname, '..', 'packages', 'db'));

// Execute command
try {
  execSync(command, { stdio: 'inherit', env: process.env });
} catch (error) {
  process.exit(error.status || 1);
}

