"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.getLogger = getLogger;
exports.createLogger = createLogger;
const winston = __importStar(require("winston"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const DailyRotateFile = require('winston-daily-rotate-file');
class Logger {
    logger;
    constructor(config = {}) {
        const { level = 'info', format = 'json', defaultMeta = {}, logDir } = config;
        const logsPath = logDir || path.resolve(process.cwd(), 'logs');
        if (!fs.existsSync(logsPath)) {
            fs.mkdirSync(logsPath, { recursive: true });
        }
        const transports = [
            new winston.transports.Console({
                format: format === 'json'
                    ? winston.format.json()
                    : winston.format.combine(winston.format.colorize(), winston.format.simple()),
            }),
        ];
        transports.push(new DailyRotateFile({
            filename: path.join(logsPath, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
        }));
        transports.push(new DailyRotateFile({
            filename: path.join(logsPath, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
            format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
        }));
        this.logger = winston.createLogger({
            level,
            format: format === 'json'
                ? winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
                : winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.simple()),
            defaultMeta,
            transports,
        });
    }
    info(message, meta) {
        this.logger.info(message, meta);
    }
    error(message, error, meta) {
        if (error instanceof Error) {
            this.logger.error(message, { error: error.message, stack: error.stack, ...meta });
        }
        else {
            this.logger.error(message, { error, ...meta });
        }
    }
    warn(message, meta) {
        this.logger.warn(message, meta);
    }
    debug(message, meta) {
        this.logger.debug(message, meta);
    }
    child(defaultMeta) {
        const format = this.logger.format ? 'json' : 'simple';
        const childLogger = new Logger({
            level: this.logger.level,
            format,
            defaultMeta: { ...this.logger.defaultMeta, ...defaultMeta },
        });
        return childLogger;
    }
}
exports.Logger = Logger;
let defaultLogger = null;
function getLogger(config) {
    if (!defaultLogger) {
        defaultLogger = new Logger(config);
    }
    return defaultLogger;
}
function createLogger(config) {
    return new Logger(config);
}
//# sourceMappingURL=logger.service.js.map