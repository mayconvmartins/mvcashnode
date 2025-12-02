const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const sourceDir = path.join(distDir, 'domain', 'src');
const targetDir = distDir;

// Função para copiar recursivamente
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyRecursive(srcPath, destPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Se existe dist/domain/src, copiar tudo para dist/
if (fs.existsSync(sourceDir)) {
  // Copiar todos os arquivos e diretórios de domain/src para dist/
  const entries = fs.readdirSync(sourceDir);
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry);
    const destPath = path.join(targetDir, entry);
    
    // Não copiar se já existe e é o mesmo arquivo
    if (entry !== 'index.js' && entry !== 'index.d.ts') {
      copyRecursive(srcPath, destPath);
    }
  }
  
  // Copiar index.js e index.d.ts por último
  const indexJs = path.join(sourceDir, 'index.js');
  const indexDts = path.join(sourceDir, 'index.d.ts');
  const targetIndexJs = path.join(targetDir, 'index.js');
  const targetIndexDts = path.join(targetDir, 'index.d.ts');
  
  if (fs.existsSync(indexJs)) {
    fs.copyFileSync(indexJs, targetIndexJs);
    console.log(`Copied ${indexJs} to ${targetIndexJs}`);
  }
  
  if (fs.existsSync(indexDts)) {
    fs.copyFileSync(indexDts, targetIndexDts);
    console.log(`Copied ${indexDts} to ${targetIndexDts}`);
  }
  
  console.log('Fixed dist structure successfully');
} else if (fs.existsSync(path.join(distDir, 'index.js'))) {
  console.log('dist/index.js already exists in correct location');
} else {
  console.error('Could not find domain/src directory in dist');
  process.exit(1);
}

