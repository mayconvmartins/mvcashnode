import { Client } from 'basic-ftp';
import * as path from 'path';
import type { BackupConfig } from './config';

export class FtpService {
  constructor(private config: BackupConfig) {}

  /**
   * Faz upload de um arquivo para o servidor FTP
   */
  async uploadFile(localFilePath: string): Promise<void> {
    if (!this.config.ftp.enabled) {
      console.log('[FTP] Upload FTP está desabilitado');
      return;
    }

    const client = new Client();
    client.ftp.verbose = false; // Reduzir verbosidade

    const startTime = Date.now();
    const filename = path.basename(localFilePath);

    try {
      console.log(`[FTP] Conectando ao servidor FTP: ${this.config.ftp.host}:${this.config.ftp.port}`);
      
      // Conectar ao servidor FTP
      await client.access({
        host: this.config.ftp.host,
        port: this.config.ftp.port,
        user: this.config.ftp.user,
        password: this.config.ftp.password,
        secure: this.config.ftp.secure,
      });

      console.log('[FTP] ✅ Conectado ao servidor FTP');

      // Criar diretório remoto se não existir
      try {
        await client.ensureDir(this.config.ftp.remoteDir);
        console.log(`[FTP] Diretório remoto verificado: ${this.config.ftp.remoteDir}`);
      } catch (error: any) {
        console.error(`[FTP] ⚠️ Erro ao criar/verificar diretório remoto: ${error.message}`);
        // Continuar mesmo se falhar - pode ser que o diretório já exista
      }

      // Mudar para o diretório remoto
      await client.cd(this.config.ftp.remoteDir);

      // Fazer upload do arquivo
      console.log(`[FTP] Enviando arquivo: ${filename}`);
      await client.uploadFrom(localFilePath, filename);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[FTP] ✅ Upload concluído com sucesso! Duração: ${duration}s`);
      console.log(`[FTP] Arquivo remoto: ${this.config.ftp.remoteDir}/${filename}`);
    } catch (error: any) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`[FTP] ❌ Erro no upload FTP (após ${duration}s):`, error.message);
      throw error;
    } finally {
      client.close();
    }
  }

  /**
   * Lista arquivos no diretório remoto FTP
   */
  async listRemoteFiles(): Promise<string[]> {
    if (!this.config.ftp.enabled) {
      return [];
    }

    const client = new Client();
    client.ftp.verbose = false;

    try {
      await client.access({
        host: this.config.ftp.host,
        port: this.config.ftp.port,
        user: this.config.ftp.user,
        password: this.config.ftp.password,
        secure: this.config.ftp.secure,
      });

      await client.cd(this.config.ftp.remoteDir);
      const files = await client.list();
      
      return files
        .filter((file: any) => file.type === 1 && file.name.startsWith('mvcash_'))
        .map((file: any) => file.name);
    } catch (error: any) {
      console.error(`[FTP] Erro ao listar arquivos remotos: ${error.message}`);
      return [];
    } finally {
      client.close();
    }
  }

  /**
   * Remove um arquivo do servidor FTP
   */
  async deleteRemoteFile(filename: string): Promise<void> {
    if (!this.config.ftp.enabled) {
      return;
    }

    const client = new Client();
    client.ftp.verbose = false;

    try {
      await client.access({
        host: this.config.ftp.host,
        port: this.config.ftp.port,
        user: this.config.ftp.user,
        password: this.config.ftp.password,
        secure: this.config.ftp.secure,
      });

      await client.cd(this.config.ftp.remoteDir);
      await client.remove(filename);
      
      console.log(`[FTP] 🗑️ Arquivo remoto removido: ${filename}`);
    } catch (error: any) {
      console.error(`[FTP] Erro ao remover arquivo remoto ${filename}: ${error.message}`);
    } finally {
      client.close();
    }
  }

  /**
   * Testa a conexão FTP
   */
  async testConnection(): Promise<boolean> {
    if (!this.config.ftp.enabled) {
      console.log('[FTP] FTP está desabilitado');
      return false;
    }

    const client = new Client();
    client.ftp.verbose = false;

    try {
      console.log('[FTP] Testando conexão FTP...');
      await client.access({
        host: this.config.ftp.host,
        port: this.config.ftp.port,
        user: this.config.ftp.user,
        password: this.config.ftp.password,
        secure: this.config.ftp.secure,
      });
      console.log('[FTP] ✅ Conexão FTP OK');
      return true;
    } catch (error: any) {
      console.error(`[FTP] ❌ Erro na conexão FTP: ${error.message}`);
      return false;
    } finally {
      client.close();
    }
  }
}

