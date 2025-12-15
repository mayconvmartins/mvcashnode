import * as fs from 'fs/promises';
import * as path from 'path';
import type { BackupConfig } from './config';
import type { FtpService } from './ftp.service';

export class CleanupService {
  constructor(
    private config: BackupConfig,
    private ftpService: FtpService
  ) {}

  /**
   * Remove backups locais antigos (mais de X dias)
   */
  async cleanupLocalBackups(): Promise<void> {
    console.log('[CLEANUP] Iniciando limpeza de backups locais antigos...');

    try {
      // Verificar se o diretório existe
      try {
        await fs.access(this.config.backup.dir);
      } catch {
        console.log(`[CLEANUP] Diretório ${this.config.backup.dir} não existe. Nada para limpar.`);
        return;
      }

      // Listar arquivos no diretório
      const files = await fs.readdir(this.config.backup.dir);
      const backupFiles = files.filter(
        (file) => file.startsWith('mvcash_') && file.endsWith('.sql.gz')
      );

      if (backupFiles.length === 0) {
        console.log('[CLEANUP] Nenhum backup encontrado para limpar.');
        return;
      }

      // Data limite (agora - retention days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.backup.retentionDays);

      let removedCount = 0;

      for (const file of backupFiles) {
        const filePath = path.join(this.config.backup.dir, file);
        
        try {
          const stats = await fs.stat(filePath);
          const fileDate = stats.mtime;

          if (fileDate < cutoffDate) {
            await fs.unlink(filePath);
            removedCount++;
            console.log(`[CLEANUP] 🗑️ Removido: ${file} (idade: ${this.getDaysOld(fileDate)} dias)`);
          }
        } catch (error: any) {
          console.error(`[CLEANUP] Erro ao processar arquivo ${file}: ${error.message}`);
        }
      }

      if (removedCount === 0) {
        console.log(`[CLEANUP] ✅ Nenhum backup local com mais de ${this.config.backup.retentionDays} dias encontrado.`);
      } else {
        console.log(`[CLEANUP] ✅ Limpeza local concluída: ${removedCount} arquivo(s) removido(s)`);
      }
    } catch (error: any) {
      console.error(`[CLEANUP] ❌ Erro durante limpeza local: ${error.message}`);
    }
  }

  /**
   * Remove backups remotos antigos (mais de X dias)
   */
  async cleanupRemoteBackups(): Promise<void> {
    if (!this.config.ftp.enabled) {
      console.log('[CLEANUP] FTP desabilitado, pulando limpeza remota.');
      return;
    }

    console.log('[CLEANUP] Iniciando limpeza de backups remotos antigos...');

    try {
      const remoteFiles = await this.ftpService.listRemoteFiles();

      if (remoteFiles.length === 0) {
        console.log('[CLEANUP] Nenhum backup remoto encontrado para limpar.');
        return;
      }

      // Data limite (agora - retention days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.backup.retentionDays);

      let removedCount = 0;

      for (const filename of remoteFiles) {
        try {
          // Extrair data do nome do arquivo: mvcash_YYYY-MM-DD_HH-mm-ss.sql.gz
          const dateMatch = filename.match(/mvcash_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
          
          if (dateMatch) {
            const [, year, month, day, hour, minute, second] = dateMatch;
            const fileDate = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(hour),
              parseInt(minute),
              parseInt(second)
            );

            if (fileDate < cutoffDate) {
              await this.ftpService.deleteRemoteFile(filename);
              removedCount++;
              console.log(`[CLEANUP] 🗑️ Removido remoto: ${filename} (idade: ${this.getDaysOld(fileDate)} dias)`);
            }
          }
        } catch (error: any) {
          console.error(`[CLEANUP] Erro ao processar arquivo remoto ${filename}: ${error.message}`);
        }
      }

      if (removedCount === 0) {
        console.log(`[CLEANUP] ✅ Nenhum backup remoto com mais de ${this.config.backup.retentionDays} dias encontrado.`);
      } else {
        console.log(`[CLEANUP] ✅ Limpeza remota concluída: ${removedCount} arquivo(s) removido(s)`);
      }
    } catch (error: any) {
      console.error(`[CLEANUP] ❌ Erro durante limpeza remota: ${error.message}`);
    }
  }

  /**
   * Executa limpeza completa (local + remota)
   */
  async cleanup(): Promise<void> {
    console.log(`[CLEANUP] ==========================================`);
    console.log(`[CLEANUP] Iniciando limpeza (retenção: ${this.config.backup.retentionDays} dias)`);
    
    await this.cleanupLocalBackups();
    await this.cleanupRemoteBackups();
    
    console.log(`[CLEANUP] ==========================================`);
  }

  /**
   * Calcula quantos dias atrás uma data é
   */
  private getDaysOld(date: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}

