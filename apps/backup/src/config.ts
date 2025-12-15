import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis de ambiente do diretório raiz do projeto
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export interface BackupConfig {
  database: {
    url: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  backup: {
    dir: string;
    retentionDays: number;
    schedule: string;
  };
  ftp: {
    enabled: boolean;
    host: string;
    port: number;
    user: string;
    password: string;
    remoteDir: string;
    secure: boolean;
  };
}

function parseDatabaseUrl(url: string) {
  // Parse DATABASE_URL: mysql://user:password@host:port/database?query_params
  // O regex agora para antes do '?' para ignorar query parameters
  const regex = /mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
  const match = url.match(regex);
  
  if (!match) {
    throw new Error('Invalid DATABASE_URL format. Expected: mysql://user:password@host:port/database');
  }

  const dbConfig = {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };

  // Log de debug (sem mostrar senha)
  console.log(`[CONFIG] Banco de dados: ${dbConfig.database}`);
  console.log(`[CONFIG] Host: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`[CONFIG] Usuário: ${dbConfig.user}`);

  return dbConfig;
}

export function loadConfig(): BackupConfig {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const dbConfig = parseDatabaseUrl(databaseUrl);

  // FTP configuration - exigir explicitamente 'true'
  const ftpEnabled = process.env.BACKUP_ENABLE_FTP === 'true';
  const ftpHost = process.env.FTP_HOST || '';
  const ftpUser = process.env.FTP_USER || '';
  const ftpPassword = process.env.FTP_PASSWORD || '';

  console.log(`[CONFIG] FTP habilitado: ${ftpEnabled}`);
  
  // Validar configurações FTP se estiver habilitado
  if (ftpEnabled) {
    if (!ftpHost || !ftpUser || !ftpPassword) {
      console.warn('[CONFIG] ⚠️ FTP está habilitado mas credenciais incompletas. FTP será desabilitado.');
      console.warn(`[CONFIG]   - FTP_HOST: ${ftpHost ? 'OK' : 'FALTANDO'}`);
      console.warn(`[CONFIG]   - FTP_USER: ${ftpUser ? 'OK' : 'FALTANDO'}`);
      console.warn(`[CONFIG]   - FTP_PASSWORD: ${ftpPassword ? 'OK' : 'FALTANDO'}`);
    } else {
      console.log(`[CONFIG] ✅ Credenciais FTP completas`);
      console.log(`[CONFIG] FTP Host: ${ftpHost}:${process.env.FTP_PORT || '21'}`);
      console.log(`[CONFIG] FTP Dir: ${process.env.FTP_REMOTE_DIR || '/backups/mvcash'}`);
    }
  }

  return {
    database: {
      url: databaseUrl,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    },
    backup: {
      dir: process.env.BACKUP_DIR || '/var/backup/mvcash',
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '3', 10),
      schedule: process.env.BACKUP_SCHEDULE || '0 * * * *', // A cada hora no minuto 0
    },
    ftp: {
      enabled: ftpEnabled && !!ftpHost && !!ftpUser && !!ftpPassword,
      host: ftpHost,
      port: parseInt(process.env.FTP_PORT || '21', 10),
      user: ftpUser,
      password: ftpPassword,
      remoteDir: process.env.FTP_REMOTE_DIR || '/backups/mvcash',
      secure: process.env.FTP_SECURE === 'true',
    },
  };
}

