import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { BackupConfig } from './config';

const execAsync = promisify(exec);

export class BackupService {
  constructor(private config: BackupConfig) {}

  /**
   * Gera nome do arquivo de backup com timestamp
   */
  private generateBackupFilename(): string {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '');
    return `mvcash_${timestamp}.sql.gz`;
  }

  /**
   * Garante que o diretório de backup existe
   */
  private async ensureBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.backup.dir, { recursive: true });
    } catch (error: any) {
      throw new Error(`Erro ao criar diretório de backup: ${error.message}`);
    }
  }

  /**
   * Executa o backup do banco de dados MySQL
   */
  async executeBackup(): Promise<string> {
    const startTime = Date.now();
    console.log('[BACKUP] Iniciando backup do banco de dados...');

    try {
      // Garantir que o diretório existe
      await this.ensureBackupDir();

      // Gerar nome do arquivo
      const filename = this.generateBackupFilename();
      const filepath = path.join(this.config.backup.dir, filename);

      console.log(`[BACKUP] Arquivo: ${filepath}`);

      // Construir comando mysqldump com compressão gzip
      const { host, port, user, password, database } = this.config.database;
      
      // Comando: mysqldump com todas as opções + gzip
      // --single-transaction: Para InnoDB sem lock
      // --quick: Para tabelas grandes
      // --lock-tables=false: Não bloquear tabelas
      const command = `mysqldump -h ${host} -P ${port} -u ${user} -p'${password}' \
        --single-transaction \
        --quick \
        --lock-tables=false \
        --add-drop-table \
        --add-locks \
        --create-options \
        --disable-keys \
        --extended-insert \
        --set-charset \
        --routines \
        --triggers \
        --events \
        ${database} | gzip > "${filepath}"`;

      // Log do comando (sem mostrar senha)
      const safeCommand = command.replace(/-p'[^']+'/, "-p'***'");
      console.log(`[BACKUP] Executando: ${safeCommand.replace(/\s+/g, ' ')}`);

      // Executar backup
      await execAsync(command, {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
      });

      // Verificar se o arquivo foi criado
      const stats = await fs.stat(filepath);
      
      // Validar tamanho do arquivo
      if (stats.size === 0) {
        throw new Error('Backup gerou arquivo vazio! Verificar credenciais do banco ou nome do banco de dados.');
      }
      
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`[BACKUP] ✅ Backup concluído com sucesso!`);
      console.log(`[BACKUP] Tamanho: ${sizeInMB} MB`);
      console.log(`[BACKUP] Duração: ${duration}s`);
      console.log(`[BACKUP] Arquivo: ${filepath}`);

      return filepath;
    } catch (error: any) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`[BACKUP] ❌ Erro ao executar backup (após ${duration}s):`, error.message);
      throw error;
    }
  }

  /**
   * Verifica se o mysqldump está disponível
   */
  async checkMysqldump(): Promise<boolean> {
    try {
      await execAsync('mysqldump --version');
      return true;
    } catch {
      return false;
    }
  }
}

