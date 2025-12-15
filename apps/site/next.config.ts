import type { NextConfig } from "next";
import * as os from "os";

const nextConfig: NextConfig = {
  compress: true,
  
  // Otimização para build paralelo com múltiplos núcleos
  experimental: {
    workerThreads: true,
    cpus: Math.max(1, Math.floor(os.cpus().length * 0.8)), // 80% dos núcleos
  },
};

export default nextConfig;

