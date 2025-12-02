import {
  TradeMode,
  ExchangeType,
  UserRole,
  PositionSide,
  TradeSide,
  OrderType,
  TradeJobStatus,
  PositionStatus,
  WebhookAction,
  WebhookEventStatus,
  VaultTransactionType,
  AuditEntityType,
  AuditAction,
  SystemAuditSeverity,
  SystemService,
  CloseReason,
} from './enums';

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface DateRangeParams {
  from?: string;
  to?: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

