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
    requires2FA?: boolean
    sessionToken?: string
    accessToken?: string
    refreshToken?: string
    user?: User
    expiresIn?: number
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
    min_profit_pct?: number
    group_positions_enabled: boolean
    group_positions_interval_minutes?: number
    vault_id?: number
    created_at: string
    updated_at: string
    exchange_account?: {
        id: number
        label: string
        exchange: string
        is_simulation: boolean
    }
    vault?: {
        id: number
        name: string
        trade_mode: string
    }
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
    is_shared?: boolean
    is_owner?: boolean
    admin_locked: boolean
    alert_group_enabled?: boolean
    alert_group_id?: string
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
    exchange_account?: {
        id: number
        label: string
        exchange: string
        is_simulation: boolean
    }
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
    price_reference?: number | string
    raw_text: string | null
    raw_payload_json: any | null
    status: WebhookEventStatus
    validation_error?: string | null
    created_at: string
    processed_at?: string | null
    webhook_source?: {
        id: number
        label: string
        webhook_code: string
    }
    jobs_created?: Array<{
        id: number
        symbol: string
        side: string
        status: string
        executions_count?: number
    }>
    jobs?: Array<{
        id: number
        symbol: string
        side: string
        status: string
        exchange_account?: {
            id: number
            label: string
            exchange: string
        }
        executions?: Array<{
            id: number
            executed_qty: number
            cumm_quote_qty: number
            avg_price: number
            status_exchange: string
            created_at: string
        }>
        position_open?: {
            id: number
            status: string
            qty_total: number
            qty_remaining: number
            price_open: number
        }
    }>
}

export interface CreateWebhookSourceDto {
    label: string
    webhookCode: string
    tradeMode: TradeMode
    allowedIPs?: string[]
    requireSignature?: boolean
    signingSecret?: string
    rateLimitPerMin?: number
    alertGroupEnabled?: boolean
    alertGroupId?: string
    isShared?: boolean
}

export interface CreateBindingDto {
    exchangeAccountId: number
    isActive?: boolean
    weight?: number
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
    min_profit_pct?: number
    sl_triggered: boolean
    tp_triggered: boolean
    trailing_triggered: boolean
    partial_tp_triggered: boolean
    lock_sell_by_webhook: boolean
    is_grouped: boolean
    group_started_at?: string
    close_reason?: string
    closed_at?: string
    created_at: string
    updated_at: string
    // Campos calculados
    current_price?: number | null
    price_close?: number | null
    invested_value_usd?: number | null
    current_value_usd?: number | null
    unrealized_pnl?: number | null
    unrealized_pnl_pct?: number | null
    // Relacionamentos
    grouped_jobs?: PositionGroupedJob[]
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

export interface PositionGroupedJob {
    id: number
    position_id: number
    trade_job_id: number
    created_at: string
    trade_job?: TradeJob
}

export interface CreateManualPositionDto {
    method: 'EXCHANGE_ORDER' | 'MANUAL'
    exchange_account_id: number
    exchange_order_id?: string
    symbol?: string
    manual_symbol?: string
    qty_total?: number
    price_open?: number
    trade_mode?: 'REAL' | 'SIMULATION'
    manual_exchange_order_id?: string
    created_at?: string
}

export interface CreateManualBuyDto {
    exchange_account_id: number
    symbol: string
    quote_amount?: number
    order_type: 'MARKET' | 'LIMIT'
    limit_price?: number
}

export interface UpdateSLTPDto {
    slEnabled?: boolean
    slPct?: number
    tpEnabled?: boolean
    tpPct?: number
    trailingEnabled?: boolean
    trailingDistancePct?: number
}

export interface PositionTPSLMonitoring {
    id: number
    symbol: string
    trade_mode: TradeMode
    exchange_account_id: number
    exchange_account_label: string
    price_open: number
    current_price: number | null
    pnl_pct: number | null
    tp_enabled: boolean
    tp_pct: number | null
    sl_enabled: boolean
    sl_pct: number | null
    tp_proximity_pct: number | null
    sl_proximity_pct: number | null
    distance_to_tp_pct: number | null
    distance_to_sl_pct: number | null
    status: 'PROFIT' | 'LOSS' | 'AT_TP' | 'AT_SL' | 'UNKNOWN'
    qty_remaining: number
    qty_total: number
    sl_triggered: boolean
    tp_triggered: boolean
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
    totalProfit: number
    totalLoss: number
    netPnL: number
    realizedPnL: number
    unrealizedPnL: number
    dailyPnL: number
    totalTrades: number
    winningTrades: number
    losingTrades: number
    winRate: number
    openPositionsCount: number
    hasData: boolean
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

// Resposta do backend para open-positions/summary
export interface OpenPositionsSummaryResponse {
    totalPositions: number
    totalUnrealizedPnL: number
    totalInvested: number
    bySymbol: Array<{
        symbol: string
        count: number
        unrealizedPnL: number
        invested: number
    }>
}

// Resposta do backend para vaults/summary
export interface VaultSummary {
    vault_id: number
    vault_name: string
    assets: Record<string, { asset: string; volume: number }>
}

// Resposta do backend para webhooks/summary
export interface WebhookSummary {
    totalEvents: number
    jobsCreated: number
    skipped: number
    failed: number
    successRate: number
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
    status?: string
    trade_mode?: string
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
    current_page: number
    per_page: number
    total_items: number
    total_pages: number
    // Campos alternativos para compatibilidade
    page?: number
    limit?: number
    total?: number
    totalPages?: number
}

export interface PositionSummary {
    total_invested: number
    total_current_value: number
    total_unrealized_pnl: number
    total_unrealized_pnl_pct: number
    total_realized_pnl: number
}

export interface PaginatedResponse<T> {
    data: T[]
    pagination: PaginationMeta
    summary?: PositionSummary
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
