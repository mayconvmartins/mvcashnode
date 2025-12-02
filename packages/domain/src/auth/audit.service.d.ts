import { PrismaClient } from '@mvcashnode/db';
import { AuditEntityType, AuditAction, SystemService, SystemAuditSeverity } from '@mvcashnode/shared';
export interface AuditLogData {
    userId?: number;
    entityType: AuditEntityType;
    entityId?: number;
    action: AuditAction;
    changes?: {
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
    };
    ip?: string;
    userAgent?: string;
    requestId?: string;
}
export interface SystemAuditLogData {
    service: SystemService;
    eventType: string;
    entityType?: AuditEntityType;
    entityId?: number;
    severity: SystemAuditSeverity;
    message: string;
    metadata?: Record<string, unknown>;
}
export declare class AuditService {
    private prisma;
    constructor(prisma: PrismaClient);
    logUserAction(data: AuditLogData): Promise<void>;
    logSystemEvent(data: SystemAuditLogData): Promise<void>;
    getUserAuditLogs(userId: number, filters?: {
        entityType?: AuditEntityType;
        action?: AuditAction;
        from?: Date;
        to?: Date;
    }, pagination?: {
        page: number;
        limit: number;
    }): Promise<any>;
    getSystemAuditLogs(filters?: {
        service?: SystemService;
        severity?: SystemAuditSeverity;
        eventType?: string;
        from?: Date;
        to?: Date;
    }, pagination?: {
        page: number;
        limit: number;
    }): Promise<any>;
}
//# sourceMappingURL=audit.service.d.ts.map