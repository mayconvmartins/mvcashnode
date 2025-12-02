import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DailyRotateFile = require('winston-daily-rotate-file');

export interface LoggerConfig {
  level?: string;
  format?: 'json' | 'simple';
  defaultMeta?: Record<string, unknown>;
  logDir?: string;
}

export class Logger {
  private logger: winston.Logger;

  constructor(config: LoggerConfig = {}) {
    const { level = 'info', format = 'json', defaultMeta = {}, logDir } = config;

    // Determine log directory (default to /logs in project root)
    const logsPath = logDir || path.resolve(process.cwd(), 'logs');
    
    // Ensure logs directory exists
    if (!fs.existsSync(logsPath)) {
      fs.mkdirSync(logsPath, { recursive: true });
    }

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format:
          format === 'json'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              ),
      }),
    ];

    // Add file transports
    transports.push(
      new DailyRotateFile({
        filename: path.join(logsPath, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      })
    );

    transports.push(
      new DailyRotateFile({
        filename: path.join(logsPath, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      })
    );

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
      transports,
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

