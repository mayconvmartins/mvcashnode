import * as sntp from 'sntp';

export interface NtpSyncResult {
  offset: number;
  serverTime: Date;
  localTime: Date;
  synced: boolean;
  error?: string;
}

export class NtpService {
  private ntpServer: string;
  private syncInterval: number;
  private enabled: boolean;
  private timeOffset: number = 0;
  private lastSync: Date | null = null;
  private syncIntervalId: NodeJS.Timeout | null = null;

  constructor(
    ntpServer: string = 'pool.ntp.org',
    syncInterval: number = 3600000, // 1 hora
    enabled: boolean = true
  ) {
    this.ntpServer = ntpServer;
    this.syncInterval = syncInterval;
    this.enabled = enabled;
  }

  /**
   * Sincroniza com servidor NTP
   */
  async sync(): Promise<NtpSyncResult> {
    if (!this.enabled) {
      return {
        offset: 0,
        serverTime: new Date(),
        localTime: new Date(),
        synced: false,
        error: 'NTP sync is disabled',
      };
    }

    try {
      const result = await sntp.time({
        host: this.ntpServer,
        port: 123,
      });

      this.timeOffset = result.t || 0;
      this.lastSync = new Date();

      const serverTime = new Date(Date.now() + this.timeOffset);
      const localTime = new Date();

      console.log(`[NTP] Sincronizado com ${this.ntpServer}`);
      console.log(`[NTP] Offset: ${this.timeOffset}ms`);
      console.log(`[NTP] Hora local: ${localTime.toISOString()}`);
      console.log(`[NTP] Hora servidor: ${serverTime.toISOString()}`);

      return {
        offset: this.timeOffset,
        serverTime,
        localTime,
        synced: true,
      };
    } catch (error: any) {
      console.error(`[NTP] Erro ao sincronizar: ${error.message}`);
      return {
        offset: this.timeOffset,
        serverTime: new Date(),
        localTime: new Date(),
        synced: false,
        error: error.message,
      };
    }
  }

  /**
   * Inicia sincronização periódica
   */
  startPeriodicSync(): void {
    if (!this.enabled) {
      console.log('[NTP] Sincronização periódica desabilitada');
      return;
    }

    // Sincronizar imediatamente
    this.sync().catch(console.error);

    // Configurar sincronização periódica
    this.syncIntervalId = setInterval(() => {
      this.sync().catch(console.error);
    }, this.syncInterval);

    console.log(`[NTP] Sincronização periódica configurada (a cada ${this.syncInterval}ms)`);
  }

  /**
   * Para sincronização periódica
   */
  stopPeriodicSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log('[NTP] Sincronização periódica parada');
    }
  }

  /**
   * Retorna o offset atual de tempo
   */
  getOffset(): number {
    return this.timeOffset;
  }

  /**
   * Retorna a última sincronização
   */
  getLastSync(): Date | null {
    return this.lastSync;
  }

  /**
   * Retorna timestamp ajustado com offset NTP
   */
  getCurrentTime(): Date {
    return new Date(Date.now() + this.timeOffset);
  }

  /**
   * Retorna timestamp Unix em milissegundos ajustado com offset NTP
   * Formato usado pelas exchanges (Binance, Bybit, etc)
   */
  getTimestamp(): number {
    return Date.now() + this.timeOffset;
  }

  /**
   * Valida se o relógio do sistema está sincronizado
   * Considera sincronizado se o offset for menor que 1 segundo
   */
  validateSystemTime(): boolean {
    return Math.abs(this.timeOffset) < 1000;
  }

  /**
   * Retorna informações do serviço
   */
  getInfo(): {
    enabled: boolean;
    server: string;
    offset: number;
    lastSync: Date | null;
    isValid: boolean;
  } {
    return {
      enabled: this.enabled,
      server: this.ntpServer,
      offset: this.timeOffset,
      lastSync: this.lastSync,
      isValid: this.validateSystemTime(),
    };
  }
}

