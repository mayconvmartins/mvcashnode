import * as si from 'systeminformation';
import pidusage from 'pidusage';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProcessMetrics {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  uptime: number;
  status: 'running' | 'stopped' | 'error';
  lastUpdate: Date;
  // Informações de cluster PM2
  pm2_id?: number;
  instances?: number;
  exec_mode?: 'cluster' | 'fork';
  cluster_instances?: Array<{
    pid: number;
    cpu: number;
    memory: number;
    status: string;
  }>;
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

  /**
   * Coleta todos os processos do PM2
   */
  async getAllPM2Processes(): Promise<ProcessMetrics[]> {
    try {
      // Usar pm2 jlist para obter JSON de todos os processos
      const { stdout } = await execAsync('pm2 jlist');
      const pm2Processes = JSON.parse(stdout);

      const processes: ProcessMetrics[] = [];

      // Agrupar processos por nome (para cluster mode)
      const processesByName = new Map<string, any[]>();
      
      for (const pm2Proc of pm2Processes) {
        const name = pm2Proc.name || 'unknown';
        if (!processesByName.has(name)) {
          processesByName.set(name, []);
        }
        processesByName.get(name)!.push(pm2Proc);
      }

      // Processar cada grupo de processos
      for (const [name, instances] of processesByName.entries()) {
        const firstInstance = instances[0];
        const isCluster = firstInstance.pm2_env?.exec_mode === 'cluster' || instances.length > 1;
        
        if (isCluster && instances.length > 1) {
          // Processo em cluster mode - agregar métricas
          let totalCpu = 0;
          let totalMemory = 0;
          let minUptime = Infinity;
          let allRunning = true;
          const clusterInstances: Array<{
            pid: number;
            cpu: number;
            memory: number;
            status: string;
          }> = [];

          for (const instance of instances) {
            const cpu = instance.monit?.cpu || 0;
            const memory = instance.monit?.memory || 0;
            const uptime = instance.pm2_env?.pm_uptime || 0;
            const status = instance.pm2_env?.status || 'stopped';
            
            totalCpu += cpu;
            totalMemory += memory;
            minUptime = Math.min(minUptime, uptime);
            if (status !== 'online') {
              allRunning = false;
            }

            clusterInstances.push({
              pid: instance.pid,
              cpu,
              memory,
              status,
            });
          }

          processes.push({
            pid: firstInstance.pid,
            name,
            cpu: totalCpu,
            memory: totalMemory,
            uptime: minUptime > 0 ? (Date.now() - minUptime) / 1000 : 0,
            status: allRunning ? 'running' : 'error',
            lastUpdate: new Date(),
            pm2_id: firstInstance.pm_id,
            instances: instances.length,
            exec_mode: 'cluster',
            cluster_instances: clusterInstances,
          });
        } else {
          // Processo único (fork mode ou cluster com 1 instância)
          const instance = firstInstance;
          const cpu = instance.monit?.cpu || 0;
          const memory = instance.monit?.memory || 0;
          const uptime = instance.pm2_env?.pm_uptime || 0;
          const status = instance.pm2_env?.status || 'stopped';

          processes.push({
            pid: instance.pid,
            name,
            cpu,
            memory,
            uptime: uptime > 0 ? (Date.now() - uptime) / 1000 : 0,
            status: status === 'online' ? 'running' : status === 'stopped' ? 'stopped' : 'error',
            lastUpdate: new Date(),
            pm2_id: instance.pm_id,
            instances: 1,
            exec_mode: instance.pm2_env?.exec_mode || 'fork',
          });
        }
      }

      return processes;
    } catch (error: any) {
      console.error('[MonitorService] Erro ao coletar processos do PM2:', error.message);
      // Retornar array vazio em caso de erro (PM2 pode não estar disponível)
      return [];
    }
  }
}

