import * as winston from 'winston';

export interface LoggerConfig {
  level?: string;
  format?: 'json' | 'simple';
  defaultMeta?: Record<string, unknown>;
}

export class Logger {
  private logger: winston.Logger;

  constructor(config: LoggerConfig = {}) {
    const { level = 'info', format = 'json', defaultMeta = {} } = config;

    this.logger = winston.createLogger({
      level,
      format:
        format === 'json'
          ? winston.format.combine(
              winston.format.timestamp(),
              winston.format.errors({ stack: true }),
              winston.format.json()
            )
          : winston.format.combine(
              winston.format.timestamp(),
              winston.format.errors({ stack: true }),
              winston.format.simple()
            ),
      defaultMeta,
      transports: [
        new winston.transports.Console({
          format:
            format === 'json'
              ? winston.format.json()
              : winston.format.combine(
                  winston.format.colorize(),
                  winston.format.simple()
                ),
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack, ...meta });
    } else {
      this.logger.error(message, { error, ...meta });
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  child(defaultMeta: Record<string, unknown>): Logger {
    // Determine format from logger configuration
    const format = this.logger.format ? 'json' : 'simple';
    const childLogger = new Logger({
      level: this.logger.level,
      format,
      defaultMeta: { ...this.logger.defaultMeta, ...defaultMeta },
    });
    return childLogger;
  }
}

let defaultLogger: Logger | null = null;

export function getLogger(config?: LoggerConfig): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger;
}

export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

