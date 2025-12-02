"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
class AuditService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async logUserAction(data) {
        await this.prisma.auditLog.create({
            data: {
                user_id: data.userId || null,
                entity_type: data.entityType,
                entity_id: data.entityId || null,
                action: data.action,
                changes_json: data.changes ? JSON.parse(JSON.stringify(data.changes)) : null,
                ip: data.ip || null,
                user_agent: data.userAgent || null,
                request_id: data.requestId || null,
            },
        });
    }
    async logSystemEvent(data) {
        await this.prisma.systemAuditLog.create({
            data: {
                service: data.service,
                event_type: data.eventType,
                entity_type: data.entityType || null,
                entity_id: data.entityId || null,
                severity: data.severity,
                message: data.message,
                metadata_json: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : null,
            },
        });
    }
    async getUserAuditLogs(userId, filters, pagination) {
        const where = { user_id: userId };
        if (filters?.entityType)
            where.entity_type = filters.entityType;
        if (filters?.action)
            where.action = filters.action;
        if (filters?.from || filters?.to) {
            where.created_at = {};
            if (filters.from)
                where.created_at.gte = filters.from;
            if (filters.to)
                where.created_at.lte = filters.to;
        }
        const skip = pagination ? (pagination.page - 1) * pagination.limit : undefined;
        const take = pagination?.limit;
        const [data, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take,
            }),
            this.prisma.auditLog.count({ where }),
        ]);
        return {
            data,
            total,
            page: pagination?.page || 1,
            limit: pagination?.limit || total,
        };
    }
    async getSystemAuditLogs(filters, pagination) {
        const where = {};
        if (filters?.service)
            where.service = filters.service;
        if (filters?.severity)
            where.severity = filters.severity;
        if (filters?.eventType)
            where.event_type = filters.eventType;
        if (filters?.from || filters?.to) {
            where.created_at = {};
            if (filters.from)
                where.created_at.gte = filters.from;
            if (filters.to)
                where.created_at.lte = filters.to;
        }
        const skip = pagination ? (pagination.page - 1) * pagination.limit : undefined;
        const take = pagination?.limit;
        const [data, total] = await Promise.all([
            this.prisma.systemAuditLog.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take,
            }),
            this.prisma.systemAuditLog.count({ where }),
        ]);
        return {
            data,
            total,
            page: pagination?.page || 1,
            limit: pagination?.limit || total,
        };
    }
}
exports.AuditService = AuditService;
//# sourceMappingURL=audit.service.js.map