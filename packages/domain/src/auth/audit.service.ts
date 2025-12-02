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

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  async logUserAction(data: AuditLogData): Promise<void> {
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

  async logSystemEvent(data: SystemAuditLogData): Promise<void> {
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

  async getUserAuditLogs(
    userId: number,
    filters?: {
      entityType?: AuditEntityType;
      action?: AuditAction;
      from?: Date;
      to?: Date;
    },
    pagination?: { page: number; limit: number }
  ) {
    const where: any = { user_id: userId };

    if (filters?.entityType) where.entity_type = filters.entityType;
    if (filters?.action) where.action = filters.action;
    if (filters?.from || filters?.to) {
      where.created_at = {};
      if (filters.from) where.created_at.gte = filters.from;
      if (filters.to) where.created_at.lte = filters.to;
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

  async getSystemAuditLogs(
    filters?: {
      service?: SystemService;
      severity?: SystemAuditSeverity;
      eventType?: string;
      from?: Date;
      to?: Date;
    },
    pagination?: { page: number; limit: number }
  ) {
    const where: any = {};

    if (filters?.service) where.service = filters.service;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.eventType) where.event_type = filters.eventType;
    if (filters?.from || filters?.to) {
      where.created_at = {};
      if (filters.from) where.created_at.gte = filters.from;
      if (filters.to) where.created_at.lte = filters.to;
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

