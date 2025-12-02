export interface LoggerConfig {
    level?: string;
    format?: 'json' | 'simple';
    defaultMeta?: Record<string, unknown>;
    logDir?: string;
}
export declare class Logger {
    private logger;
    constructor(config?: LoggerConfig);
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
    child(defaultMeta: Record<string, unknown>): Logger;
}
export declare function getLogger(config?: LoggerConfig): Logger;
export declare function createLogger(config?: LoggerConfig): Logger;
//# sourceMappingURL=logger.service.d.ts.map