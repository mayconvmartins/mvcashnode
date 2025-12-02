"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloseReason = exports.SystemService = exports.SystemAuditSeverity = exports.AuditAction = exports.AuditEntityType = exports.VaultTransactionType = exports.WebhookEventStatus = exports.WebhookAction = exports.PositionStatus = exports.TradeJobStatus = exports.OrderType = exports.TradeSide = exports.PositionSide = exports.UserRole = exports.ExchangeType = exports.TradeMode = void 0;
var TradeMode;
(function (TradeMode) {
    TradeMode["REAL"] = "REAL";
    TradeMode["SIMULATION"] = "SIMULATION";
})(TradeMode || (exports.TradeMode = TradeMode = {}));
var ExchangeType;
(function (ExchangeType) {
    ExchangeType["BINANCE_SPOT"] = "BINANCE_SPOT";
    ExchangeType["BINANCE_FUTURES"] = "BINANCE_FUTURES";
    ExchangeType["BYBIT_SPOT"] = "BYBIT_SPOT";
    ExchangeType["BYBIT_FUTURES"] = "BYBIT_FUTURES";
})(ExchangeType || (exports.ExchangeType = ExchangeType = {}));
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "admin";
    UserRole["USER"] = "user";
})(UserRole || (exports.UserRole = UserRole = {}));
var PositionSide;
(function (PositionSide) {
    PositionSide["LONG"] = "LONG";
    PositionSide["SHORT"] = "SHORT";
})(PositionSide || (exports.PositionSide = PositionSide = {}));
var TradeSide;
(function (TradeSide) {
    TradeSide["BUY"] = "BUY";
    TradeSide["SELL"] = "SELL";
})(TradeSide || (exports.TradeSide = TradeSide = {}));
var OrderType;
(function (OrderType) {
    OrderType["MARKET"] = "MARKET";
    OrderType["LIMIT"] = "LIMIT";
    OrderType["STOP_LIMIT"] = "STOP_LIMIT";
})(OrderType || (exports.OrderType = OrderType = {}));
var TradeJobStatus;
(function (TradeJobStatus) {
    TradeJobStatus["PENDING"] = "PENDING";
    TradeJobStatus["EXECUTING"] = "EXECUTING";
    TradeJobStatus["FILLED"] = "FILLED";
    TradeJobStatus["PARTIALLY_FILLED"] = "PARTIALLY_FILLED";
    TradeJobStatus["FAILED"] = "FAILED";
    TradeJobStatus["SKIPPED"] = "SKIPPED";
    TradeJobStatus["CANCELED"] = "CANCELED";
    TradeJobStatus["PENDING_LIMIT"] = "PENDING_LIMIT";
})(TradeJobStatus || (exports.TradeJobStatus = TradeJobStatus = {}));
var PositionStatus;
(function (PositionStatus) {
    PositionStatus["OPEN"] = "OPEN";
    PositionStatus["CLOSED"] = "CLOSED";
})(PositionStatus || (exports.PositionStatus = PositionStatus = {}));
var WebhookAction;
(function (WebhookAction) {
    WebhookAction["BUY_SIGNAL"] = "BUY_SIGNAL";
    WebhookAction["SELL_SIGNAL"] = "SELL_SIGNAL";
    WebhookAction["UNKNOWN"] = "UNKNOWN";
})(WebhookAction || (exports.WebhookAction = WebhookAction = {}));
var WebhookEventStatus;
(function (WebhookEventStatus) {
    WebhookEventStatus["RECEIVED"] = "RECEIVED";
    WebhookEventStatus["JOB_CREATED"] = "JOB_CREATED";
    WebhookEventStatus["SKIPPED"] = "SKIPPED";
    WebhookEventStatus["FAILED"] = "FAILED";
})(WebhookEventStatus || (exports.WebhookEventStatus = WebhookEventStatus = {}));
var VaultTransactionType;
(function (VaultTransactionType) {
    VaultTransactionType["DEPOSIT"] = "DEPOSIT";
    VaultTransactionType["WITHDRAWAL"] = "WITHDRAWAL";
    VaultTransactionType["BUY_RESERVE"] = "BUY_RESERVE";
    VaultTransactionType["BUY_CONFIRM"] = "BUY_CONFIRM";
    VaultTransactionType["BUY_CANCEL"] = "BUY_CANCEL";
    VaultTransactionType["SELL_RETURN"] = "SELL_RETURN";
})(VaultTransactionType || (exports.VaultTransactionType = VaultTransactionType = {}));
var AuditEntityType;
(function (AuditEntityType) {
    AuditEntityType["USER"] = "USER";
    AuditEntityType["EXCHANGE_ACCOUNT"] = "EXCHANGE_ACCOUNT";
    AuditEntityType["VAULT"] = "VAULT";
    AuditEntityType["POSITION"] = "POSITION";
    AuditEntityType["WEBHOOK_SOURCE"] = "WEBHOOK_SOURCE";
    AuditEntityType["TRADE_JOB"] = "TRADE_JOB";
    AuditEntityType["TRADE_PARAMETER"] = "TRADE_PARAMETER";
})(AuditEntityType || (exports.AuditEntityType = AuditEntityType = {}));
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["PASSWORD_CHANGE"] = "PASSWORD_CHANGE";
    AuditAction["TWO_FA_ENABLE"] = "2FA_ENABLE";
    AuditAction["TWO_FA_DISABLE"] = "2FA_DISABLE";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
var SystemAuditSeverity;
(function (SystemAuditSeverity) {
    SystemAuditSeverity["INFO"] = "INFO";
    SystemAuditSeverity["WARNING"] = "WARNING";
    SystemAuditSeverity["ERROR"] = "ERROR";
    SystemAuditSeverity["CRITICAL"] = "CRITICAL";
})(SystemAuditSeverity || (exports.SystemAuditSeverity = SystemAuditSeverity = {}));
var SystemService;
(function (SystemService) {
    SystemService["API"] = "API";
    SystemService["EXECUTOR"] = "EXECUTOR";
    SystemService["MONITORS"] = "MONITORS";
})(SystemService || (exports.SystemService = SystemService = {}));
var CloseReason;
(function (CloseReason) {
    CloseReason["TARGET_HIT"] = "TARGET_HIT";
    CloseReason["STOP_LOSS"] = "STOP_LOSS";
    CloseReason["MANUAL"] = "MANUAL";
    CloseReason["WEBHOOK_SELL"] = "WEBHOOK_SELL";
    CloseReason["RECONCILIATION"] = "RECONCILIATION";
})(CloseReason || (exports.CloseReason = CloseReason = {}));
//# sourceMappingURL=enums.js.map