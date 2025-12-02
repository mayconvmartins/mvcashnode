export declare enum TradeMode {
    REAL = "REAL",
    SIMULATION = "SIMULATION"
}
export declare enum ExchangeType {
    BINANCE_SPOT = "BINANCE_SPOT",
    BINANCE_FUTURES = "BINANCE_FUTURES",
    BYBIT_SPOT = "BYBIT_SPOT",
    BYBIT_FUTURES = "BYBIT_FUTURES"
}
export declare enum UserRole {
    ADMIN = "admin",
    USER = "user"
}
export declare enum PositionSide {
    LONG = "LONG",
    SHORT = "SHORT"
}
export declare enum TradeSide {
    BUY = "BUY",
    SELL = "SELL"
}
export declare enum OrderType {
    MARKET = "MARKET",
    LIMIT = "LIMIT",
    STOP_LIMIT = "STOP_LIMIT"
}
export declare enum TradeJobStatus {
    PENDING = "PENDING",
    EXECUTING = "EXECUTING",
    FILLED = "FILLED",
    PARTIALLY_FILLED = "PARTIALLY_FILLED",
    FAILED = "FAILED",
    SKIPPED = "SKIPPED",
    CANCELED = "CANCELED",
    PENDING_LIMIT = "PENDING_LIMIT"
}
export declare enum PositionStatus {
    OPEN = "OPEN",
    CLOSED = "CLOSED"
}
export declare enum WebhookAction {
    BUY_SIGNAL = "BUY_SIGNAL",
    SELL_SIGNAL = "SELL_SIGNAL",
    UNKNOWN = "UNKNOWN"
}
export declare enum WebhookEventStatus {
    RECEIVED = "RECEIVED",
    JOB_CREATED = "JOB_CREATED",
    SKIPPED = "SKIPPED",
    FAILED = "FAILED"
}
export declare enum VaultTransactionType {
    DEPOSIT = "DEPOSIT",
    WITHDRAWAL = "WITHDRAWAL",
    BUY_RESERVE = "BUY_RESERVE",
    BUY_CONFIRM = "BUY_CONFIRM",
    BUY_CANCEL = "BUY_CANCEL",
    SELL_RETURN = "SELL_RETURN"
}
export declare enum AuditEntityType {
    USER = "USER",
    EXCHANGE_ACCOUNT = "EXCHANGE_ACCOUNT",
    VAULT = "VAULT",
    POSITION = "POSITION",
    WEBHOOK_SOURCE = "WEBHOOK_SOURCE",
    TRADE_JOB = "TRADE_JOB",
    TRADE_PARAMETER = "TRADE_PARAMETER"
}
export declare enum AuditAction {
    CREATE = "CREATE",
    UPDATE = "UPDATE",
    DELETE = "DELETE",
    LOGIN = "LOGIN",
    LOGOUT = "LOGOUT",
    PASSWORD_CHANGE = "PASSWORD_CHANGE",
    TWO_FA_ENABLE = "2FA_ENABLE",
    TWO_FA_DISABLE = "2FA_DISABLE"
}
export declare enum SystemAuditSeverity {
    INFO = "INFO",
    WARNING = "WARNING",
    ERROR = "ERROR",
    CRITICAL = "CRITICAL"
}
export declare enum SystemService {
    API = "API",
    EXECUTOR = "EXECUTOR",
    MONITORS = "MONITORS"
}
export declare enum CloseReason {
    TARGET_HIT = "TARGET_HIT",
    STOP_LOSS = "STOP_LOSS",
    MANUAL = "MANUAL",
    WEBHOOK_SELL = "WEBHOOK_SELL",
    RECONCILIATION = "RECONCILIATION"
}
//# sourceMappingURL=enums.d.ts.map