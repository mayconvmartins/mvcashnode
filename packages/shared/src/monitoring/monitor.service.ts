import * as si from 'systeminformation';
import pidusage from 'pidusage';

export interface ProcessMetrics {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  uptime: number;
  status: 'running' | 'stopped' | 'error';
  lastUpdate: Date;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    speed: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  uptime: number;
  timestamp: Date;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  message?: string;
  lastCheck: Date;
  responseTime?: number;
}

export class MonitorService {
  private cpuUsageStart: NodeJS.CpuUsage | null = null;
  private lastCpuCheck: number = Date.now();

  /**
   * Coleta métricas de um processo específico por PID
   */
  async getProcessMetrics(pid: number, name: string): Promise<ProcessMetrics> {
    try {
      const stats = await pidusage(pid);
      
      // Log para debug
      console.log(`[MonitorService] Métricas coletadas para ${name} (PID: ${pid}):`, {
        cpu: stats.cpu,
        memory: stats.memory,
        elapsed: stats.elapsed,
      });
      
      return {
        pid,
        name,
        cpu: stats.cpu || 0,
        memory: stats.memory || 0,
        uptime: stats.elapsed ? stats.elapsed / 1000 : 0, // Converter para segundos
        status: 'running',
        lastUpdate: new Date(),
      };
    } catch (error: any) {
      console.error(`[MonitorService] Erro ao coletar métricas do processo ${name} (PID: ${pid}):`, error.message);
      
      // Fallback: usar métricas nativas do Node.js se for o processo atual
      if (pid === process.pid) {
        return this.getCurrentProcessMetricsNative(name);
      }
      
      // Para outros processos, retornar erro
      return {
        pid,
        name,
        cpu: 0,
        memory: 0,
        uptime: 0,
        status: 'error',
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Coleta métricas do processo atual usando APIs nativas do Node.js
   */
  private getCurrentProcessMetricsNative(name: string): ProcessMetrics {
    try {
      // Memória
      const memUsage = process.memoryUsage();
      const memory = memUsage.rss; // Resident Set Size

      // CPU (aproximado)
      let cpuPercent = 0;
      const cpuUsageNow = process.cpuUsage();
      
      if (this.cpuUsageStart) {
        const now = Date.now();
        const timeDiff = now - this.lastCpuCheck;
        
        if (timeDiff > 0) {
          const userDiff = cpuUsageNow.user - this.cpuUsageStart.user;
          const systemDiff = cpuUsageNow.system - this.cpuUsageStart.system;
          const totalDiff = userDiff + systemDiff;
          
          // Converter para porcentagem
          cpuPercent = (totalDiff / (timeDiff * 1000)) * 100;
        }
      }
      
      // Atualizar baseline
      this.cpuUsageStart = cpuUsageNow;
      this.lastCpuCheck = Date.now();

      // Uptime
      const uptime = process.uptime();

      console.log(`[MonitorService] Métricas nativas para ${name}:`, {
        cpu: cpuPercent,
        memory,
        uptime,
      });

      return {
        pid: process.pid,
        name,
        cpu: cpuPercent,
        memory,
        uptime,
        status: 'running',
        lastUpdate: new Date(),
      };
    } catch (error: any) {
      console.error(`[MonitorService] Erro ao coletar métricas nativas:`, error);
      return {
        pid: process.pid,
        name,
        cpu: 0,
        memory: 0,
        uptime: 0,
        status: 'error',
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Coleta métricas do processo atual
   */
  async getCurrentProcessMetrics(name: string): Promise<ProcessMetrics> {
    try {
      // Tentar primeiro com pidusage
      const stats = await pidusage(process.pid);
      
      if (stats.cpu === 0 && stats.memory === 0) {
        // Se retornar zeros, usar método nativo
        console.log(`[MonitorService] pidusage retornou zeros, usando método nativo`);
        return this.getCurrentProcessMetricsNative(name);
      }
      
      return {
        pid: process.pid,
        name,
        cpu: stats.cpu || 0,
        memory: stats.memory || 0,
        uptime: stats.elapsed ? stats.elapsed / 1000 : process.uptime(),
        status: 'running',
        lastUpdate: new Date(),
      };
    } catch (error) {
      // Fallback para método nativo
      console.log(`[MonitorService] Erro com pidusage, usando método nativo:`, error);
      return this.getCurrentProcessMetricsNative(name);
    }
  }

  /**
   * Coleta métricas do sistema
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const [cpuData, memData, diskData] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
      ]);

      const cpuInfo = await si.cpu();
      
      // Disk metrics (primeiro disco)
      const mainDisk = diskData[0] || { size: 0, used: 0, available: 0 };
      const diskTotal = mainDisk.size;
      const diskUsed = mainDisk.used;
      const diskFree = mainDisk.available || (diskTotal - diskUsed);

      return {
        cpu: {
          usage: cpuData.currentLoad,
          cores: cpuInfo.cores,
          speed: cpuInfo.speed,
        },
        memory: {
          total: memData.total,
          used: memData.used,
          free: memData.free,
          usagePercent: (memData.used / memData.total) * 100,
        },
        disk: {
          total: diskTotal,
          used: diskUsed,
          free: diskFree,
          usagePercent: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0,
        },
        uptime: si.time().uptime,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[MonitorService] Erro ao coletar métricas do sistema:', error);
      throw error;
    }
  }

  /**
   * Verifica saúde de um serviço via HTTP
   */
  async checkServiceHealth(
    name: string,
    url: string,
    timeout: number = 5000
  ): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          name,
          status: 'healthy',
          lastCheck: new Date(),
          responseTime,
        };
      } else {
        return {
          name,
          status: 'degraded',
          message: `HTTP ${response.status}`,
          lastCheck: new Date(),
          responseTime,
        };
      }
    } catch (error: any) {
      return {
        name,
        status: 'down',
        message: error.message || 'Service unreachable',
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Verifica conectividade com Redis
   */
  async checkRedisHealth(redisClient: any): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      await redisClient.ping();
      const responseTime = Date.now() - startTime;

      return {
        name: 'Redis',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
      };
    } catch (error: any) {
      return {
        name: 'Redis',
        status: 'down',
        message: error.message,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Verifica conectividade com banco de dados
   */
  async checkDatabaseHealth(prismaClient: any): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      await prismaClient.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      return {
        name: 'Database',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
      };
    } catch (error: any) {
      return {
        name: 'Database',
        status: 'down',
        message: error.message,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Detecta se um processo está travado baseado no último update
   */
  isProcessStuck(lastUpdate: Date, maxAgeMinutes: number = 5): boolean {
    const now = Date.now();
    const updateTime = lastUpdate.getTime();
    const ageMinutes = (now - updateTime) / (1000 * 60);
    
    return ageMinutes > maxAgeMinutes;
  }

  /**
   * Formata bytes para string legível
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Formata porcentagem
   */
  formatPercent(value: number): string {
    return `${value.toFixed(2)}%`;
  }
}

