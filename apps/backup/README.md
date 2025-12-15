# MVCash Node - Serviço de Backup MySQL

Serviço automatizado de backup do banco de dados MySQL com upload FTP e rotatividade de arquivos.

## Funcionalidades

- ✅ **Backup automático** a cada hora (configurável)
- ✅ **Compressão gzip** para economizar espaço
- ✅ **Upload FTP** automático para backup offsite
- ✅ **Rotatividade automática** (remove backups com mais de 3 dias)
- ✅ **Gerenciado pelo PM2** (auto-restart, logs, monitoramento)
- ✅ **Logging estruturado** com timestamps
- ✅ **Resiliente**: continua funcionando mesmo se FTP falhar

## Requisitos

- **mysqldump** instalado no sistema
- **Node.js** 22+
- **PM2** para gerenciamento do processo
- Servidor FTP (opcional)

## Instalação

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar variáveis de ambiente

Adicione as seguintes variáveis no arquivo `.env` na raiz do projeto:

```env
# Banco de dados (já existente)
DATABASE_URL=mysql://user:password@host:port/database

# Configurações de Backup (opcionais)
BACKUP_DIR=/var/backup/mvcash              # Diretório local de backup
BACKUP_RETENTION_DAYS=3                    # Dias de retenção
BACKUP_SCHEDULE="0 * * * *"                # Cron: a cada hora

# Configurações FTP (obrigatórias se FTP habilitado)
FTP_HOST=ftp.example.com                   # Host do servidor FTP
FTP_PORT=21                                # Porta FTP
FTP_USER=username                          # Usuário FTP
FTP_PASSWORD=password                      # Senha FTP
FTP_REMOTE_DIR=/backups/mvcash            # Diretório remoto
FTP_SECURE=false                           # true para FTPS
BACKUP_ENABLE_FTP=true                     # Habilitar/desabilitar FTP
```

### 3. Criar diretório de backup

```bash
mkdir -p /var/backup/mvcash
# Ou usar o diretório configurado em BACKUP_DIR
```

### 4. Build

```bash
# Build apenas do serviço de backup
pnpm --filter @mvcashnode/backup build

# Ou build de todos os serviços
pnpm build
```

## Uso

### Desenvolvimento

```bash
pnpm --filter @mvcashnode/backup dev
```

### Produção com PM2

```bash
# Iniciar todos os serviços (incluindo backup)
pm2 start ecosystem.config.js

# Ou apenas o serviço de backup
pm2 start ecosystem.config.js --only mvcashnode-backup

# Ver logs
pm2 logs mvcashnode-backup

# Status
pm2 status

# Reiniciar
pm2 restart mvcashnode-backup

# Parar
pm2 stop mvcashnode-backup
```

## Estrutura dos Backups

Os backups são salvos com o seguinte formato:

```
/var/backup/mvcash/
├── mvcash_2025-12-15_00-00-00.sql.gz
├── mvcash_2025-12-15_01-00-00.sql.gz
├── mvcash_2025-12-15_02-00-00.sql.gz
└── ...
```

Formato: `mvcash_YYYY-MM-DD_HH-mm-ss.sql.gz`

## Restauração de Backup

Para restaurar um backup:

```bash
# 1. Descompactar
gunzip mvcash_2025-12-15_00-00-00.sql.gz

# 2. Restaurar no MySQL
mysql -h HOST -P PORT -u USER -p DATABASE < mvcash_2025-12-15_00-00-00.sql

# Ou em uma linha (mantém o arquivo compactado)
gunzip -c mvcash_2025-12-15_00-00-00.sql.gz | mysql -h HOST -P PORT -u USER -p DATABASE
```

## Configuração do Schedule

O schedule usa formato cron. Exemplos:

```bash
"0 * * * *"      # A cada hora no minuto 0
"0 */2 * * *"    # A cada 2 horas
"0 0 * * *"      # Todo dia à meia-noite
"*/30 * * * *"   # A cada 30 minutos
"0 2,14 * * *"   # Às 2h e 14h todos os dias
```

## Monitoramento

### Logs do PM2

```bash
# Ver logs em tempo real
pm2 logs mvcashnode-backup

# Logs de erro
pm2 logs mvcashnode-backup --err

# Logs de saída
pm2 logs mvcashnode-backup --out
```

### Arquivos de Log

Os logs são salvos em:
- `logs/backup-out.log` - Saída padrão
- `logs/backup-error.log` - Erros

### Exemplo de Log de Sucesso

```
==========================================
[MAIN] Iniciando processo de backup: 2025-12-15T12:00:00.000Z
==========================================
[BACKUP] Iniciando backup do banco de dados...
[BACKUP] Arquivo: /var/backup/mvcash/mvcash_2025-12-15_12-00-00.sql.gz
[BACKUP] ✅ Backup concluído com sucesso!
[BACKUP] Tamanho: 45.32 MB
[BACKUP] Duração: 8.45s
[FTP] Conectando ao servidor FTP: ftp.example.com:21
[FTP] ✅ Conectado ao servidor FTP
[FTP] Enviando arquivo: mvcash_2025-12-15_12-00-00.sql.gz
[FTP] ✅ Upload concluído com sucesso! Duração: 12.34s
[CLEANUP] Iniciando limpeza de backups locais antigos...
[CLEANUP] ✅ Nenhum backup local com mais de 3 dias encontrado.
[MAIN] ✅ Processo de backup concluído com sucesso!
[MAIN] Duração total: 21.56s
==========================================
```

## Troubleshooting

### Erro: mysqldump não encontrado

```bash
# Ubuntu/Debian
sudo apt install mysql-client

# CentOS/RHEL
sudo yum install mysql

# macOS
brew install mysql-client
```

### Erro de permissão no diretório

```bash
# Dar permissão ao diretório
sudo chown -R $(whoami) /var/backup/mvcash
sudo chmod 755 /var/backup/mvcash
```

### FTP não conecta

1. Verificar credenciais no `.env`
2. Verificar firewall/porta do servidor FTP
3. Verificar se o servidor FTP permite o IP de origem
4. Tentar com `FTP_SECURE=true` se o servidor exigir FTPS

### Backup muito lento

- Considerar aumentar `maxBuffer` em `backup.service.ts`
- Verificar se o banco está com muito volume
- Considerar fazer backups menos frequentes
- Verificar velocidade do disco/rede

## Manutenção

### Limpeza Manual

```bash
# Listar backups antigos
find /var/backup/mvcash -name "mvcash_*.sql.gz" -mtime +3

# Remover backups com mais de 7 dias
find /var/backup/mvcash -name "mvcash_*.sql.gz" -mtime +7 -delete
```

### Verificar Espaço em Disco

```bash
# Ver tamanho do diretório de backup
du -sh /var/backup/mvcash

# Ver espaço disponível
df -h /var/backup
```

### Atualizar Dependências

```bash
cd apps/backup
pnpm update
pnpm build
pm2 restart mvcashnode-backup
```

## Segurança

- ✅ Credenciais do banco são lidas do `.env` (não commitadas no git)
- ✅ Senha FTP é lida do `.env` (não commitada no git)
- ✅ Backups são armazenados compactados
- ⚠️ Considerar criptografar backups sensíveis antes do upload FTP
- ⚠️ Usar FTPS (`FTP_SECURE=true`) sempre que possível
- ⚠️ Restringir permissões do diretório de backup local

## Suporte

Para problemas ou dúvidas, consulte:
- Logs do PM2: `pm2 logs mvcashnode-backup`
- Documentação do projeto: `docs/DEPLOYMENT.md`

