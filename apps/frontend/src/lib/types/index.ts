// ============================================
// ENUMS
// ============================================

export enum TradeMode {
    REAL = 'REAL',
    SIMULATION = 'SIMULATION',
}

export enum Exchange {
    BINANCE_SPOT = 'BINANCE_SPOT',
    BINANCE_FUTURES = 'BINANCE_FUTURES',
    BYBIT_SPOT = 'BYBIT_SPOT',
    BYBIT_FUTURES = 'BYBIT_FUTURES',
}

export enum TradeSide {
    BUY = 'BUY',
    SELL = 'SELL',
    BOTH = 'BOTH',
}

export enum OrderType {
    MARKET = 'MARKET',
    LIMIT = 'LIMIT',
    STOP_LIMIT = 'STOP_LIMIT',
}

export enum PositionStatus {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED',
}

export enum JobStatus {
    PENDING = 'PENDING',
    EXECUTING = 'EXECUTING',
    FILLED = 'FILLED',
    PARTIALLY_FILLED = 'PARTIALLY_FILLED',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
    CANCELED = 'CANCELED',
    PENDING_LIMIT = 'PENDING_LIMIT',
}

export enum WebhookEventStatus {
    RECEIVED = 'RECEIVED',
    JOB_CREATED = 'JOB_CREATED',
    SKIPPED = 'SKIPPED',
    FAILED = 'FAILED',
}

export enum WebhookAction {
    BUY_SIGNAL = 'BUY_SIGNAL',
    SELL_SIGNAL = 'SELL_SIGNAL',
    UNKNOWN = 'UNKNOWN',
}

export enum UserRole {
    ADMIN = 'admin',
    USER = 'user',
}

// ============================================
// USER & AUTH
// ============================================

export interface User {
    id: number
    email: string
    is_active: boolean
    must_change_password: boolean
    created_at: string
    updated_at: string
    profile?: Profile
    roles: UserRole[]
}

export interface Profile {
    user_id: number
    full_name: string
    phone?: string
    whatsapp_phone?: string
    position_alerts_enabled: boolean
    twofa_enabled: boolean
    created_at: string
    updated_at: string
}

export interface LoginResponse {
    accessToken: string
    refreshToken: string
    user: User
}

export interface RefreshTokenResponse {
    accessToken: string
    refreshToken: string
}

// ============================================
// EXCHANGE ACCOUNTS
// ============================================

export interface ExchangeAccount {
    id: number
    user_id: number
    exchange: Exchange
    label: string
    is_simulation: boolean
    is_active: boolean
    testnet: boolean
    proxy_url?: string
    initial_balances_json?: Record<string, number>
    created_at: string
    updated_at: string
}

export interface CreateExchangeAccountDto {
    exchange: Exchange
    label: string
    isSimulation: boolean
    apiKey?: string
    apiSecret?: string
    proxyUrl?: string
    testnet?: boolean
    initialBalances?: Record<string, number>
}

export interface UpdateExchangeAccountDto {
    label?: string
    isActive?: boolean
    apiKey?: string
    apiSecret?: string
    proxyUrl?: string
    testnet?: boolean
    initialBalances?: Record<string, number>
}

// ============================================
// VAULTS
// ============================================

export interface Vault {
    id: number
    user_id: number
    name: string
    description?: string
    trade_mode: TradeMode
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface VaultBalance {
    id: number
    vault_id: number
    asset: string
    balance: number
    reserved: number
    created_at: string
    updated_at: string
}

export interface VaultTransaction {
    id: number
    vault_id: number
    type: string
    asset: string
    amount: number
    trade_job_id?: number
    meta_json?: any
    created_at: string
}

export interface CreateVaultDto {
    name: string
    description?: string
    tradeMode: TradeMode
}

export interface DepositDto {
    asset: string
    amount: number
}

export interface WithdrawDto {
    asset: string
    amount: number
}

// ============================================
// TRADE PARAMETERS
// ============================================

export interface TradeParameter {
    id: number
    exchange_account_id: number
    symbol: string
    side: TradeSide
    quote_amount_fixed?: number
    quote_amount_pct_balance?: number
    max_orders_per_hour?: number
    min_interval_sec?: number
    order_type_default: OrderType
    slippage_bps?: number
    default_sl_enabled: boolean
    default_sl_pct?: number
    default_tp_enabled: boolean
    default_tp_pct?: number
    trailing_stop_enabled: boolean
    trailing_distance_pct?: number
    vault_id?: number
    created_at: string
    updated_at: string
}

// ============================================
// WEBHOOKS
// ============================================

export interface WebhookSource {
    id: number
    owner_user_id: number
    label: string
    webhook_code: string
    trade_mode: TradeMode
    allowed_ips_json?: string[]
    require_signature: boolean
    signing_secret_enc?: string
    rate_limit_per_min: number
    is_active: boolean
    admin_locked: boolean
    created_at: string
    updated_at: string
}

export interface AccountWebhookBinding {
    id: number
    webhook_source_id: number
    exchange_account_id: number
    is_active: boolean
    weight?: number
    created_at: string
    updated_at: string
}

export interface WebhookEvent {
    id: number
    webhook_source_id: number
    target_account_id: number
    trade_mode: TradeMode
    event_uid: string
    symbol_raw: string
    symbol_normalized: string
    action: WebhookAction
    timeframe?: string
    price_reference?: number
    raw_text: string
    raw_payload_json: any
    status: WebhookEventStatus
    validation_error?: string
    created_at: string
    processed_at?: string
}

export interface CreateWebhookSourceDto {
    label: string
    webhookCode: string
    tradeMode: TradeMode
    allowedIPs?: string[]
    requireSignature?: boolean
    signingSecret?: string
    rateLimitPerMin?: number
}

// ============================================
// POSITIONS
// ============================================

export interface Position {
    id: number
    exchange_account_id: number
    trade_mode: TradeMode
    symbol: string
    side: 'LONG' | 'SHORT'
    trade_job_id_open: number
    qty_total: number
    qty_remaining: number
    price_open: number
    status: PositionStatus
    realized_profit_usd: number
    sl_enabled: boolean
    sl_pct?: number
    tp_enabled: boolean
    tp_pct?: number
    trailing_enabled: boolean
    trailing_distance_pct?: number
    trailing_max_price?: number
    sl_triggered: boolean
    tp_triggered: boolean
    trailing_triggered: boolean
    partial_tp_triggered: boolean
    lock_sell_by_webhook: boolean
    close_reason?: string
    closed_at?: string
    created_at: string
    updated_at: string
}

export interface PositionFill {
    id: number
    position_id: number
    trade_execution_id: number
    side: TradeSide
    qty: number
    price: number
    created_at: string
}

export interface UpdateSLTPDto {
    slEnabled?: boolean
    slPct?: number
    tpEnabled?: boolean
    tpPct?: number
    trailingEnabled?: boolean
    trailingDistancePct?: number
}

export interface ClosePositionDto {
    quantity?: number
    orderType?: OrderType
    limitPrice?: number
}

export interface SellLimitDto {
    limitPrice: number
    quantity?: number
    expiresInHours?: number
}

// ============================================
// TRADE JOBS & EXECUTIONS
// ============================================

export interface TradeJob {
    id: number
    webhook_event_id?: number
    exchange_account_id: number
    trade_mode: TradeMode
    symbol: string
    side: TradeSide
    order_type: OrderType
    quote_amount?: number
    base_quantity?: number
    limit_price?: number
    status: JobStatus
    reason_code?: string
    reason_message?: string
    vault_id?: number
    limit_order_expires_at?: string
    created_at: string
    updated_at: string
}

export interface TradeExecution {
    id: number
    trade_job_id: number
    exchange_account_id: number
    trade_mode: TradeMode
    exchange: Exchange
    exchange_order_id?: string
    client_order_id: string
    status_exchange: string
    executed_qty: number
    cumm_quote_qty: number
    avg_price: number
    fills_json?: any
    raw_response_json: any
    created_at: string
}

// ============================================
// REPORTS
// ============================================

export interface PnLSummary {
    total_profit: number
    total_loss: number
    net_pnl: number
    total_trades: number
    win_rate: number
    avg_win: number
    avg_loss: number
}

export interface PnLBySymbol {
    symbol: string
    pnl_usd: number
    trades: number
    win_rate: number
}

export interface PnLByDay {
    date: string
    pnl_usd: number
    trades: number
}

export interface OpenPositionsSummary {
    exchange_account_id: number
    symbol: string
    total_qty: number
    avg_entry_price: number
    current_value_usdt: number
    unrealized_pnl_usdt: number
}

export interface VaultSummary {
    vault_id: number
    vault_name: string
    balances: Record<string, number>
    volume_moved: number
}

export interface WebhookSummary {
    webhook_source_id: number
    source_label: string
    total_events: number
    jobs_created: number
    blocked_count: number
    pnl_real?: number
    pnl_simulation?: number
}

// ============================================
// FILTERS
// ============================================

export interface PositionFilters {
    status?: PositionStatus
    trade_mode?: TradeMode
    exchange_account_id?: number
    symbol?: string
    from?: string
    to?: string
    page?: number
    limit?: number
}

export interface LimitOrderFilters {
    status?: JobStatus
    side?: TradeSide
    trade_mode?: TradeMode
    symbol?: string
    page?: number
    limit?: number
}

export interface WebhookEventFilters {
    webhookSourceId?: number
    status?: WebhookEventStatus
    page?: number
    limit?: number
}

export interface ReportFilters {
    trade_mode?: TradeMode
    from?: string
    to?: string
    exchange_account_id?: number
}

// ============================================
// PAGINATION
// ============================================

export interface PaginationMeta {
    page: number
    limit: number
    total: number
    totalPages: number
}

export interface PaginatedResponse<T> {
    data: T[]
    pagination: PaginationMeta
}

// ============================================
// API RESPONSES
// ============================================

export interface ApiError {
    statusCode: number
    message: string | string[]
    error: string
}

export interface TestConnectionResponse {
    success: boolean
    message: string
    error?: string
}
