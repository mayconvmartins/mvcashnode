import { apiClient } from './client'
import type { User, UserRole, PaginatedResponse } from '@/lib/types'

export interface AdminUserFilters {
    role?: UserRole
    is_active?: boolean
    email?: string
    page?: number
    limit?: number
}

export interface CreateUserDto {
    email: string
    password: string
    roles: UserRole[]
    profile?: {
        full_name: string
        phone?: string
        whatsapp_phone?: string
    }
}

export interface UpdateUserDto {
    email?: string
    roles?: UserRole[]
    is_active?: boolean
    profile?: {
        full_name?: string
        phone?: string
        whatsapp_phone?: string
        position_alerts_enabled?: boolean
    }
}

export interface AuditLogFilters {
    user_id?: number
    entity_type?: string
    action?: string
    from?: string
    to?: string
    page?: number
    limit?: number
    search?: string
}

export interface SystemAuditLogFilters {
    service?: string
    severity?: string
    from?: string
    to?: string
    page: number
    limit: number
}

export const adminService = {
    // Users
    listUsers: async (filters?: AdminUserFilters): Promise<PaginatedResponse<User>> => {
        const response = await apiClient.get<PaginatedResponse<User>>('/admin/users', {
            params: filters,
        })
        return response.data
    },

    getUser: async (id: number): Promise<User> => {
        const response = await apiClient.get<User>(`/admin/users/${id}`)
        return response.data
    },

    createUser: async (data: CreateUserDto): Promise<User> => {
        const response = await apiClient.post<User>('/admin/users', data)
        return response.data
    },

    updateUser: async (id: number, data: UpdateUserDto): Promise<User> => {
        const response = await apiClient.put<User>(`/admin/users/${id}`, data)
        return response.data
    },

    deleteUser: async (id: number): Promise<void> => {
        await apiClient.delete(`/admin/users/${id}`)
    },

    activateUser: async (id: number): Promise<User> => {
        const response = await apiClient.post<User>(`/admin/users/${id}/activate`)
        return response.data
    },

    resetPassword: async (id: number): Promise<{ message: string }> => {
        const response = await apiClient.post(`/admin/users/${id}/reset-password`)
        return response.data
    },

    resetUserPassword: async (userId: string | number, data: { newPassword: string }): Promise<{ message: string }> => {
        const response = await apiClient.post(`/admin/users/${userId}/reset-password`, data)
        return response.data
    },

    changeUserPassword: async (
        userId: string | number,
        data: { newPassword: string; mustChangePassword?: boolean }
    ): Promise<{ message: string }> => {
        const response = await apiClient.put(`/admin/users/${userId}/change-password`, data)
        return response.data
    },

    resetUser2FA: async (userId: string | number): Promise<{ message: string }> => {
        const response = await apiClient.post(`/admin/users/${userId}/reset-2fa`)
        return response.data
    },

    getUserAuditLogs: async (
        id: number,
        page: number,
        limit: number
    ): Promise<PaginatedResponse<any>> => {
        const response = await apiClient.get<PaginatedResponse<any>>(
            `/admin/users/${id}/audit-logs`,
            {
                params: { page, limit },
            }
        )
        return response.data
    },

    // System Health
    getHealth: async (): Promise<any> => {
        const response = await apiClient.get('/admin/health')
        return response.data
    },

    getMetrics: async (): Promise<any> => {
        const response = await apiClient.get('/admin/metrics')
        return response.data
    },

    // Admin Dashboard Stats
    getStats: async (): Promise<{
        totalUsers: number
        activeUsers: number
        activeSessions: number
        auditEvents: number
        uptime: string
        openPositions: number
        totalTrades: number
        recentActivity: Array<{
            id: number
            action: string
            user: string
            timestamp: string
            entityType?: string
            entityId?: number
        }>
        alerts: Array<{
            id: number
            level: string
            title: string
            message: string
            timestamp: string
        }>
    }> => {
        const response = await apiClient.get('/admin/stats')
        return response.data
    },

    // Audit Logs
    getAuditLogs: async (filters?: AuditLogFilters): Promise<PaginatedResponse<any>> => {
        const response = await apiClient.get<PaginatedResponse<any>>('/admin/audit-logs', {
            params: filters,
        })
        return response.data
    },

    getSystemAuditLogs: async (
        filters: SystemAuditLogFilters
    ): Promise<PaginatedResponse<any>> => {
        const response = await apiClient.get<PaginatedResponse<any>>('/admin/audit-logs/system', {
            params: filters,
        })
        return response.data
    },

    getAuditLog: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/audit-logs/${id}`)
        return response.data
    },

    // User Impersonation
    impersonateUser: async (id: number): Promise<{
        message: string
        accessToken: string
        user: {
            id: number
            email: string
            full_name: string
            roles: string[]
        }
        expiresIn: number
        impersonatedBy: {
            id: number
            email: string
        }
    }> => {
        const response = await apiClient.post(`/admin/users/${id}/impersonate`)
        return response.data
    },

    // System Operations
    syncExecutionFees: async (): Promise<{
        total_checked: number
        updated: number
        errors: number
        error_details?: Array<{ executionId: number; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/sync-execution-fees', {}, {
            timeout: 300000, // 5 minutos para sincronização (pode processar muitas execuções)
        })
        return response.data
    },

    fixIncorrectFees: async (): Promise<{
        total_checked: number
        fixed: number
        errors: number
        error_details?: Array<{ executionId: number; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/fix-incorrect-fees', {}, {
            timeout: 300000, // 5 minutos para correção
        })
        return response.data
    },

    auditAll: async (params?: {
        from?: string
        to?: string
        accountId?: number
        checkJobsOnly?: boolean
    }): Promise<{
        total_positions_checked: number
        total_executions_checked: number
        total_jobs_checked?: number
        discrepancies_found: number
        discrepancies: Array<{
            type: string
            entityType: 'EXECUTION' | 'POSITION' | 'JOB'
            entityId: number
            field: string
            currentValue: number | string
            expectedValue: number | string
            canAutoFix: boolean
            fixDescription: string
        }>
        errors: number
        error_details?: Array<{ positionId?: number; executionId?: number; jobId?: number; error: string }>
        duration_ms?: number
    }> => {
        const queryParams = new URLSearchParams()
        if (params?.from) queryParams.append('from', params.from)
        if (params?.to) queryParams.append('to', params.to)
        if (params?.accountId) queryParams.append('accountId', params.accountId.toString())
        if (params?.checkJobsOnly) queryParams.append('checkJobsOnly', 'true')
        
        const url = `/admin/system/audit-all${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
        const response = await apiClient.post(url, {}, {
            timeout: 1800000, // 30 minutos para auditoria completa (pode processar muitas posições)
        })
        return response.data
    },

    auditFix: async (corrections: Array<{
        type: string
        entityType: 'EXECUTION' | 'POSITION'
        entityId: number
        field: string
        expectedValue: number | string
    }>): Promise<{
        total_corrections: number
        fixed: number
        errors: number
        error_details?: Array<{ correction: any; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/audit-fix', { corrections }, {
            timeout: 300000, // 5 minutos para correção
        })
        return response.data
    },

    auditExchangeTrades: async (params: {
        from: string
        to: string
        accountId: number
        autoDelete?: boolean
    }): Promise<{
        account_id: number
        period: { from: string; to: string }
        exchange_trades: {
            buy_count: number
            sell_count: number
            total_count: number
        }
        system_executions: {
            buy_count: number
            sell_count: number
            total_count: number
        }
        missing_in_system: Array<{
            order_id: string
            side: 'BUY' | 'SELL'
            symbol: string
            qty: number
            price: number
            timestamp: string
            trades_count: number
        }>
        extra_in_system: Array<{
            execution_id: number
            job_id: number
            exchange_order_id: string
            side: 'BUY' | 'SELL'
            symbol: string
        }>
        duplicates: Array<{
            exchange_order_id: string
            execution_ids: number[]
            job_ids: number[]
            count: number
        }>
        jobs_without_order_id: Array<{
            job_id: number
            symbol: string
            side: 'BUY' | 'SELL'
            status: string
            execution_id?: number
        }>
        errors?: Array<{ symbol?: string; error: string }>
        duration_ms?: number
        deletions?: {
            duplicates: number
            not_found: number
            canceled: number
            total: number
            errors: Array<{ executionId: number; error: string }>
        }
        corrections?: {
            jobs_without_order_id_fixed: number
            jobs_corrected: Array<{ job_id: number; execution_id: number; order_id: string }>
        }
    }> => {
        const queryParams = new URLSearchParams()
        queryParams.append('from', params.from)
        queryParams.append('to', params.to)
        queryParams.append('accountId', params.accountId.toString())
        if (params.autoDelete) {
            queryParams.append('autoDelete', 'true')
        }
        
        const url = `/admin/system/audit-exchange-trades?${queryParams.toString()}`
        const response = await apiClient.post(url, {}, {
            timeout: 1800000, // 30 minutos
        })
        return response.data
    },

    fixExchangeTrades: async (data: {
        accountId: number
        missingTrades?: Array<{
            orderId: string
            symbol: string
            side: 'BUY' | 'SELL'
            price: number
            qty: number
            timestamp: string
        }>
        extraExecutionIds?: number[]
        duplicateOrderIds?: string[]
    }): Promise<{
        missing_imported: number
        extra_deleted: number
        duplicates_fixed: number
        errors: number
        error_details?: Array<{ type: string; data: any; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/fix-exchange-trades', data, {
            timeout: 600000, // 10 minutos
        })
        return response.data
    },

    syncWithExchange: async (params: {
        from: string
        to: string
        accountId: number
        autoFix?: boolean
    }): Promise<{
        account_id: number
        period: { from: string; to: string }
        validations: {
            orphan_jobs: Array<{ job_id: number; reason: string }>
            duplicate_positions: Array<{ job_id_open: number; position_ids: number[] }>
            duplicate_jobs: Array<{ order_id: string; job_ids: number[] }>
            jobs_without_exchange: Array<{ job_id: number; order_id: string }>
        }
        fixes_applied?: {
            jobs_deleted: number
            positions_deleted: number
            jobs_corrected: number
            executions_corrected: number
        }
        errors?: Array<{ type: string; id: number; error: string }>
        duration_ms?: number
    }> => {
        const queryParams = new URLSearchParams()
        queryParams.append('from', params.from)
        queryParams.append('to', params.to)
        queryParams.append('accountId', params.accountId.toString())
        if (params.autoFix) {
            queryParams.append('autoFix', 'true')
        }
        
        const url = `/admin/system/sync-with-exchange?${queryParams.toString()}`
        const response = await apiClient.post(url, {}, {
            timeout: 1800000, // 30 minutos
        })
        return response.data
    },

    auditFifoPositions: async (hours?: number, dryRun?: boolean): Promise<{
        totalExecutions: number
        checkedExecutions: number
        problemsFound: number
        fixed: number
        errors: string[]
        dryRun: boolean
        duration_ms: number
        details: Array<{
            executionId: number
            executionQty: number
            fillsSum: number
            status: 'OK' | 'MISMATCH' | 'FIFO_ERROR' | 'MISSING_FILLS'
            positionsBefore: Array<{ id: number; qty_remaining: number; status: string; created_at: string }>
            positionsAfter: Array<{ id: number; qty_remaining: number; status: string }>
            correctPositions: Array<{ id: number; qty_remaining: number }>
            fixed: boolean
            error?: string
        }>
    }> => {
        const response = await apiClient.post('/admin/audit-fifo-positions', { hours, dryRun }, {
            timeout: 600000, // 10 minutos para auditoria
        })
        return response.data
    },

    identifyDustPositions: async (): Promise<{
        candidates: Array<{
            positionId: number
            symbol: string
            exchangeAccountId: number
            qtyRemaining: number
            qtyTotal: number
            percentage: number
            currentValueUsd: number
            currentPrice: number
        }>
        total_found: number
    }> => {
        const response = await apiClient.post('/admin/system/identify-dust-positions', {}, {
            timeout: 300000, // 5 minutos
        })
        return response.data
    },

    convertToDust: async (positionIds: number[]): Promise<{
        total_requested: number
        converted: number
        new_dust_positions: number[]
        errors: number
        error_details?: Array<{ positionId: number; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/convert-to-dust', { positionIds }, {
            timeout: 300000, // 5 minutos
        })
        return response.data
    },

    getDustPositions: async (): Promise<{
        groups: Array<{
            symbol: string
            exchangeAccountId: number
            exchange: string
            totalQty: number
            totalValueUsd: number
            positionCount: number
            positionIds: number[]
            canClose: boolean
        }>
        positions: Array<{
            id: number
            symbol: string
            exchange_account_id: number
            exchange_account_label: string
            exchange: string
            qty_remaining: number
            qty_total: number
            price_open: number
            dust_value_usd: number
            original_position_id: number | null
            created_at: string
        }>
        total_count: number
    }> => {
        const response = await apiClient.get('/admin/system/dust-positions', {
            timeout: 60000, // 1 minuto
        })
        return response.data
    },

    closeDustBySymbol: async (symbol: string, exchangeAccountId: number, positionIds: number[]): Promise<{
        message: string
        tradeJobId: number
        totalQty: number
        totalValueUsd: number
        symbol: string
        positionIds: number[]
    }> => {
        const response = await apiClient.post('/admin/system/close-dust-by-symbol', {
            symbol,
            exchangeAccountId,
            positionIds,
        }, {
            timeout: 60000, // 1 minuto
        })
        return response.data
    },

    // Subscriptions
    listSubscriptions: async (filters?: { status?: string; plan_id?: number }): Promise<any[]> => {
        const response = await apiClient.get('/admin/subscriptions', {
            params: filters,
        })
        return response.data
    },

    getSubscription: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscriptions/${id}`)
        return response.data
    },

    updateSubscription: async (id: number, data: any): Promise<any> => {
        const response = await apiClient.put(`/admin/subscriptions/${id}`, data)
        return response.data
    },

    cancelSubscription: async (id: number): Promise<any> => {
        const response = await apiClient.post(`/admin/subscriptions/${id}/cancel`)
        return response.data
    },

    extendSubscription: async (id: number, days: number): Promise<any> => {
        const response = await apiClient.post(`/admin/subscriptions/${id}/extend`, { days })
        return response.data
    },

    getSubscriptionPayments: async (id: number): Promise<any[]> => {
        const response = await apiClient.get(`/admin/subscriptions/${id}/payments`)
        return response.data
    },

    // Subscribers
    listSubscribers: async (filters?: { email?: string; is_active?: boolean }): Promise<any[]> => {
        const response = await apiClient.get('/admin/subscribers', {
            params: filters,
        })
        return response.data
    },

    getSubscriber: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscribers/${id}`)
        return response.data
    },

    updateSubscriber: async (id: number, data: any): Promise<any> => {
        const response = await apiClient.put(`/admin/subscribers/${id}`, data)
        return response.data
    },

    deactivateSubscriber: async (id: number): Promise<any> => {
        const response = await apiClient.post(`/admin/subscribers/${id}/deactivate`)
        return response.data
    },

    changeSubscriberPassword: async (id: number, newPassword: string): Promise<any> => {
        const response = await apiClient.post(`/admin/subscribers/${id}/change-password`, {
            new_password: newPassword,
        })
        return response.data
    },

    getSubscriberParameters: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscribers/${id}/parameters`)
        return response.data
    },

    syncSubscribers: async (): Promise<{
        success: boolean
        synced_webhooks: number
        synced_parameters: number
        skipped_parameters: number
        total_subscribers: number
    }> => {
        const response = await apiClient.post('/admin/subscribers/sync')
        return response.data
    },

    // Subscription Plans
    listSubscriptionPlans: async (): Promise<any[]> => {
        const response = await apiClient.get('/admin/subscription-plans')
        return response.data
    },

    getSubscriptionPlan: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscription-plans/${id}`)
        return response.data
    },

    createSubscriptionPlan: async (data: any): Promise<any> => {
        const response = await apiClient.post('/admin/subscription-plans', data)
        return response.data
    },

    updateSubscriptionPlan: async (id: number, data: any): Promise<any> => {
        const response = await apiClient.put(`/admin/subscription-plans/${id}`, data)
        return response.data
    },

    deleteSubscriptionPlan: async (id: number): Promise<any> => {
        const response = await apiClient.delete(`/admin/subscription-plans/${id}`)
        return response.data
    },

    // Subscriber Parameters
    listSubscriberParameters: async (): Promise<any[]> => {
        const response = await apiClient.get('/admin/subscriber-parameters')
        return response.data
    },

    getSubscriberParametersByUser: async (userId: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscriber-parameters/${userId}`)
        return response.data
    },

    updateSubscriberParameters: async (userId: number, data: any): Promise<any> => {
        const response = await apiClient.put(`/admin/subscriber-parameters/${userId}`, data)
        return response.data
    },

    createSubscriberParameters: async (data: {
        user_id: number;
        default_exchange_account_id?: number;
        max_orders_per_hour?: number;
        min_interval_sec?: number;
        default_order_type?: string;
        slippage_bps?: number;
        default_sl_enabled?: boolean;
        default_sl_pct?: number;
        default_tp_enabled?: boolean;
        default_tp_pct?: number;
        trailing_stop_enabled?: boolean;
        trailing_distance_pct?: number;
        min_profit_pct?: number;
    }): Promise<any> => {
        const response = await apiClient.post('/admin/subscriber-parameters', data)
        return response.data
    },

    // Mercado Pago Config
    getMercadoPagoPublicKey: async (): Promise<{ public_key: string }> => {
        const response = await apiClient.get('/subscriptions/mercadopago/public-key')
        return response.data
    },

    getMercadoPagoConfig: async (): Promise<any> => {
        const response = await apiClient.get('/admin/mercadopago/config')
        return response.data
    },

    updateMercadoPagoConfig: async (data: any): Promise<any> => {
        const response = await apiClient.put('/admin/mercadopago/config', data)
        return response.data
    },

    testMercadoPagoConnection: async (): Promise<any> => {
        const response = await apiClient.post('/admin/mercadopago/test-connection')
        return response.data
    },

    // Subscriber Default Webhooks
    listSubscriberWebhooks: async (): Promise<any[]> => {
        const response = await apiClient.get('/admin/subscriber-webhooks')
        return response.data
    },

    getSubscriberWebhook: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscriber-webhooks/${id}`)
        return response.data
    },

    createSubscriberWebhook: async (data: any): Promise<any> => {
        const response = await apiClient.post('/admin/subscriber-webhooks', data)
        return response.data
    },

    updateSubscriberWebhook: async (id: number, data: any): Promise<any> => {
        const response = await apiClient.put(`/admin/subscriber-webhooks/${id}`, data)
        return response.data
    },

    deleteSubscriberWebhook: async (id: number): Promise<any> => {
        const response = await apiClient.delete(`/admin/subscriber-webhooks/${id}`)
        return response.data
    },

    // Mercado Pago Payments
    listMercadoPagoPayments: async (filters?: {
        status?: string;
        payment_method?: string;
        page?: number;
        limit?: number;
    }): Promise<any[]> => {
        const response = await apiClient.get('/admin/mercadopago/payments', {
            params: filters,
        })
        return response.data
    },

    getMercadoPagoPayment: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/mercadopago/payments/${id}`)
        return response.data
    },

    refundMercadoPagoPayment: async (id: number, cancelSubscription: boolean): Promise<any> => {
        const response = await apiClient.post(`/admin/mercadopago/payments/${id}/refund`, {
            cancel_subscription: cancelSubscription,
        })
        return response.data
    },

    // Mercado Pago Webhook Logs
    listMercadoPagoWebhookLogs: async (filters?: {
        mp_event_type?: string;
        processed?: boolean;
        page?: number;
        limit?: number;
    }): Promise<any[]> => {
        const response = await apiClient.get('/admin/mercadopago/webhook-logs', {
            params: filters,
        })
        return response.data
    },

    getMercadoPagoWebhookLog: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/mercadopago/webhook-logs/${id}`)
        return response.data
    },

    syncMercadoPagoPayments: async (): Promise<any> => {
        const response = await apiClient.post('/admin/mercadopago/sync-payments')
        return response.data
    },

    // TransFi Config
    getTransFiConfig: async (): Promise<any> => {
        const response = await apiClient.get('/admin/transfi/config')
        return response.data
    },

    updateTransFiConfig: async (data: {
        merchant_id: string;
        username: string;
        password: string;
        webhook_secret?: string;
        environment: 'sandbox' | 'production';
        webhook_url?: string;
        redirect_url?: string;
        is_active?: boolean;
    }): Promise<any> => {
        const response = await apiClient.put('/admin/transfi/config', data)
        return response.data
    },

    testTransFiConnection: async (): Promise<any> => {
        const response = await apiClient.post('/admin/transfi/test-connection')
        return response.data
    },

    // TransFi Payments
    listTransFiPayments: async (filters?: {
        status?: string;
        payment_method?: string;
        page?: number;
        limit?: number;
    }): Promise<any[]> => {
        const response = await apiClient.get('/admin/transfi/payments', {
            params: filters,
        })
        return response.data
    },

    getTransFiPayment: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/transfi/payments/${id}`)
        return response.data
    },

    refundTransFiPayment: async (id: number, cancelSubscription: boolean, reason?: string): Promise<any> => {
        const response = await apiClient.post(`/admin/transfi/payments/${id}/refund`, {
            cancel_subscription: cancelSubscription,
            reason: reason,
        })
        return response.data
    },

    // TransFi Webhook Logs
    listTransFiWebhookLogs: async (filters?: {
        transfi_event_type?: string;
        processed?: boolean;
        page?: number;
        limit?: number;
    }): Promise<any[]> => {
        const response = await apiClient.get('/admin/transfi/webhook-logs', {
            params: filters,
        })
        return response.data
    },

    getTransFiWebhookLog: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/transfi/webhook-logs/${id}`)
        return response.data
    },

    syncTransFiPayments: async (): Promise<any> => {
        const response = await apiClient.post('/admin/transfi/sync-payments')
        return response.data
    },

    // Payment Gateway Settings
    getPaymentGateway: async (): Promise<{ gateway: string; available_gateways: string[] }> => {
        const response = await apiClient.get('/admin/settings/payment-gateway')
        return response.data
    },

    setPaymentGateway: async (gateway: 'mercadopago' | 'transfi'): Promise<any> => {
        const response = await apiClient.put('/admin/settings/payment-gateway', { gateway })
        return response.data
    },

    // Subscription Provider Settings (native vs mvm_pay)
    getSubscriptionProvider: async (): Promise<{ provider: string; available_providers: string[] }> => {
        const response = await apiClient.get('/admin/settings/subscription-provider')
        return response.data
    },

    setSubscriptionProvider: async (provider: 'native' | 'mvm_pay'): Promise<any> => {
        const response = await apiClient.put('/admin/settings/subscription-provider', { provider })
        return response.data
    },

    // MvM Pay Config
    getMvmPayConfig: async (): Promise<any> => {
        const response = await apiClient.get('/admin/mvm-pay/config')
        return response.data
    },

    updateMvmPayConfig: async (data: {
        base_url: string;
        checkout_url: string;
        api_key: string;
        api_secret: string;
        product_id: number;
        is_active?: boolean;
    }): Promise<any> => {
        const response = await apiClient.put('/admin/mvm-pay/config', data)
        return response.data
    },

    testMvmPayConnection: async (): Promise<any> => {
        const response = await apiClient.post('/admin/mvm-pay/test-connection')
        return response.data
    },

    getMvmPayLogs: async (filters?: {
        page?: number
        limit?: number
        level?: string
        source?: string
        email?: string
        path?: string
    }): Promise<{ page: number; limit: number; total: number; items: any[] }> => {
        const response = await apiClient.get('/admin/mvm-pay/logs', { params: filters })
        return response.data
    },

    generateMvmPayActivationLinkForSubscriber: async (subscriberId: number): Promise<{ success: boolean; message: string; activation_url?: string; expires_at: string }> => {
        const response = await apiClient.post(`/admin/subscribers/${subscriberId}/mvm-pay/activation-link`)
        return response.data
    },

    // Email Management
    getEmailHistory: async (filters?: {
        page?: number;
        limit?: number;
        template_type?: string;
        status?: string;
        recipient?: string;
    }): Promise<{
        items: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> => {
        const response = await apiClient.get('/admin/emails/history', { params: filters })
        return response.data
    },

    getEmailStats: async (): Promise<{
        total: number;
        sent: number;
        failed: number;
        successRate: string;
        byType: Record<string, number>;
        last24Hours: number;
    }> => {
        const response = await apiClient.get('/admin/emails/history/stats')
        return response.data
    },

    sendTestEmail: async (data: {
        email: string;
        subject?: string;
        message?: string;
    }): Promise<{ success: boolean; message: string }> => {
        const response = await apiClient.post('/admin/emails/test', data)
        return response.data
    },

    // Email Templates
    getEmailTemplates: async (): Promise<any[]> => {
        const response = await apiClient.get('/admin/email-templates')
        return response.data
    },

    getEmailTemplate: async (name: string): Promise<any> => {
        const response = await apiClient.get(`/admin/email-templates/${name}`)
        return response.data
    },

    updateEmailTemplate: async (name: string, content: string): Promise<any> => {
        const response = await apiClient.put(`/admin/email-templates/${name}`, { content })
        return response.data
    },

    previewEmailTemplate: async (name: string, variables?: Record<string, any>): Promise<{
        template: any;
        variables: Record<string, any>;
        rendered: string;
    }> => {
        const response = await apiClient.post(`/admin/email-templates/${name}/preview`, { variables })
        return response.data
    },

    cancelAllPendingOrders: async (params?: {
        accountIds?: number[];
        symbol?: string;
        side?: 'BUY' | 'SELL';
        orderType?: 'MARKET' | 'LIMIT';
        dryRun?: boolean;
    }): Promise<{
        success: boolean;
        message?: string;
        dryRun?: boolean;
        ordersFound?: number;
        orphansFound?: number;
        withExecutions?: number;
        orders?: Array<{
            id: number;
            symbol: string;
            side: string;
            orderType: string;
            status: string;
            hasExchangeOrder: boolean;
            exchangeOrderId: string | null;
            accountId: number;
            accountLabel: string;
            isOrphan: boolean;
        }>;
        total?: number;
        canceledInExchange?: number;
        canceledInDb?: number;
        errors?: number;
        errorDetails?: Array<{ orderId: number; error: string }>;
    }> => {
        const response = await apiClient.post('/admin/cancel-all-pending-orders', params || {}, {
            timeout: 300000, // 5 minutos
        })
        return response.data
    },

    enqueuePendingLimitOrders: async (params?: {
        accountIds?: number[];
        symbol?: string;
        side?: 'BUY' | 'SELL';
        tradeMode?: 'REAL' | 'SIMULATION';
        dryRun?: boolean;
        limit?: number;
    }): Promise<{
        success: boolean;
        dryRun?: boolean;
        ordersFound?: number;
        orders?: Array<{
            id: number;
            symbol: string;
            side: string;
            orderType: string;
            tradeMode: string;
            limitPrice: number;
            accountId: number;
            accountLabel: string;
            createdAt: string;
        }>;
        total?: number;
        enqueued?: number;
        alreadyEnqueued?: number;
        errors?: number;
        errorDetails?: Array<{ orderId: number; error: string }>;
    }> => {
        const response = await apiClient.post('/admin/enqueue-pending-limit-orders', params || {}, {
            timeout: 300000, // 5 minutos
        })
        return response.data
    },

    // Orphaned Executions
    detectOrphanedExecutions: async (): Promise<Array<{
        jobId: number;
        executionId: number;
        symbol: string;
        qty: number;
        price: number;
        value: number;
        positionId: number | null;
        positionStatus: string;
        positionQtyRemaining: number;
        reason: string;
        createdAt: string;
    }>> => {
        const response = await apiClient.get('/admin/orphaned-executions')
        return response.data
    },

    getAlternativePositions: async (jobId: number): Promise<{
        jobId: number;
        symbol: string;
        executedQty: number;
        originalPosition: {
            id: number;
            symbol: string;
            status: string;
            qty_remaining: number;
        } | null;
        needsAlternative: boolean;
        alternatives: Array<{
            id: number;
            symbol: string;
            qty_remaining: number;
            qty_total: number;
            price_open: number;
            created_at: string;
        }>;
    }> => {
        const response = await apiClient.get(`/admin/orphaned-executions/${jobId}/alternative-positions`)
        return response.data
    },

    fixOrphanedExecutions: async (
        jobIds: number[],
        alternativePositions?: Array<{ jobId: number; positionId: number }>
    ): Promise<{
        fixed: number;
        failed: number;
        needsAlternative?: Array<{
            jobId: number;
            reason: string;
            originalPositionId: number;
            originalPositionStatus: string;
        }>;
        results: Array<{
            jobId: number;
            success: boolean;
            qtyFixed?: number;
            positionId?: number;
            error?: string;
            needsAlternative?: boolean;
        }>;
    }> => {
        const response = await apiClient.post('/admin/fix-orphaned-executions', { 
            jobIds,
            alternativePositions 
        }, {
            timeout: 300000, // 5 minutos
        })
        return response.data
    },

    // Missing Orders Detection
    detectMissingOrders: async (accountId: number, from?: string, to?: string): Promise<{
        accountId: number;
        accountName: string;
        missing: Array<{
            exchangeOrderId: string;
            symbol: string;
            side: 'BUY' | 'SELL';
            qty: number;
            price: number;
            cost: number;
            fee: number;
            feeCurrency: string;
            timestamp: string;
            info: any;
        }>;
        total: number;
    }> => {
        const params: any = {}
        if (from) params.from = from
        if (to) params.to = to
        
        const response = await apiClient.get(`/admin/detect-missing-orders/${accountId}`, {
            params,
            timeout: 300000, // 5 minutos
        })
        return response.data
    },

    getOpenPositions: async (accountId: number, symbol: string): Promise<Array<{
        id: number;
        symbol: string;
        qty_total: number;
        qty_remaining: number;
        price_open: number;
        created_at: string;
    }>> => {
        const response = await apiClient.get(`/admin/open-positions/${accountId}/${encodeURIComponent(symbol)}`)
        return response.data
    },

    importMissingOrders: async (data: {
        accountId: number;
        orders: Array<{
            exchangeOrderId: string;
            symbol: string;
            side: 'BUY' | 'SELL';
            qty: number;
            price: number;
            cost: number;
            fee: number;
            feeCurrency: string;
            timestamp: string;
            positionId?: number;
        }>;
    }): Promise<{
        imported: number;
        failed: number;
        results: Array<{
            exchangeOrderId: string;
            success: boolean;
            jobId?: number;
            executionId?: number;
            error?: string;
        }>;
    }> => {
        const response = await apiClient.post('/admin/import-missing-orders', data, {
            timeout: 300000, // 5 minutos
        })
        return response.data
    },

    // ============================================
    // SUBSCRIBER POSITIONS MANAGEMENT
    // ============================================

    listSubscriberPositions: async (filters?: {
        subscriber_id?: number;
        symbol?: string;
        status?: 'OPEN' | 'CLOSED';
        trade_mode?: 'REAL' | 'SIMULATION';
        date_from?: string;
        date_to?: string;
        sort_by?: 'created_at' | 'pnl_pct' | 'invested_value_usd';
        sort_order?: 'asc' | 'desc';
        page?: number;
        limit?: number;
    }): Promise<{
        data: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
        summary: {
            total_positions: number;
            total_invested_usd: number;
            total_unrealized_pnl_usd: number;
            total_realized_pnl_usd: number;
        };
    }> => {
        const response = await apiClient.get('/admin/subscribers/positions', { params: filters })
        return response.data
    },

    getSubscriberPosition: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscribers/positions/${id}`)
        return response.data
    },

    bulkUpdateSubscriberPositions: async (data: {
        positionIds: number[];
        lock_sell_by_webhook?: boolean;
        sl_enabled?: boolean;
        sl_pct?: number;
        tp_enabled?: boolean;
        tp_pct?: number;
        sg_enabled?: boolean;
        sg_pct?: number;
        sg_drop_pct?: number;
        tsg_enabled?: boolean;
        tsg_activation_pct?: number;
        tsg_drop_pct?: number;
    }): Promise<{
        updated: number;
        requested: number;
        invalid_ids: number[];
    }> => {
        const response = await apiClient.put('/admin/subscribers/positions/bulk-update', data)
        return response.data
    },

    // ============================================
    // SUBSCRIBER OPERATIONS MANAGEMENT
    // ============================================

    listSubscriberOperations: async (filters?: {
        subscriber_id?: number;
        symbol?: string;
        status?: string;
        side?: 'BUY' | 'SELL';
        trade_mode?: 'REAL' | 'SIMULATION';
        date_from?: string;
        date_to?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        data: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
        summary: {
            total_operations: number;
            by_status: Array<{ status: string; _count: { id: number } }>;
        };
    }> => {
        const response = await apiClient.get('/admin/subscribers/operations', { params: filters })
        return response.data
    },

    getSubscriberOperation: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/subscribers/operations/${id}`)
        return response.data
    },

    // ============================================
    // SUBSCRIBER DEFAULT PARAMETERS
    // ============================================

    getSubscriberDefaultParameters: async (): Promise<{
        id: number;
        min_quote_amount: number;
        max_quote_amount: number | null;
        default_quote_amount: number;
        allowed_symbols: string | null;
        default_sl_enabled: boolean;
        default_sl_pct: number | null;
        default_tp_enabled: boolean;
        default_tp_pct: number | null;
        default_sg_enabled: boolean;
        default_sg_pct: number | null;
        default_sg_drop_pct: number | null;
        default_tsg_enabled: boolean;
        default_tsg_activation_pct: number | null;
        default_tsg_drop_pct: number | null;
        min_profit_pct: number | null;
        lock_webhook_on_tsg: boolean;
    }> => {
        const response = await apiClient.get('/admin/subscribers/default-parameters')
        return response.data
    },

    updateSubscriberDefaultParameters: async (data: {
        min_quote_amount?: number;
        max_quote_amount?: number | null;
        default_quote_amount?: number;
        allowed_symbols?: string | null;
        default_sl_enabled?: boolean;
        default_sl_pct?: number | null;
        default_tp_enabled?: boolean;
        default_tp_pct?: number | null;
        default_sg_enabled?: boolean;
        default_sg_pct?: number | null;
        default_sg_drop_pct?: number | null;
        default_tsg_enabled?: boolean;
        default_tsg_activation_pct?: number | null;
        default_tsg_drop_pct?: number | null;
        min_profit_pct?: number | null;
        lock_webhook_on_tsg?: boolean;
    }): Promise<{ success: boolean; message: string; data: any }> => {
        const response = await apiClient.put('/admin/subscribers/default-parameters', data)
        return response.data
    },

    // ============================================
    // SUBSCRIBER HEATMAP
    // ============================================

    getSubscribersHeatmap: async (filters?: {
        subscriber_id?: number;
        trade_mode?: 'REAL' | 'SIMULATION';
    }): Promise<{
        data: Array<{
            id: number;
            symbol: string;
            qty_remaining: number;
            qty_total: number;
            price_open: number;
            current_price: number;
            invested_value_usd: number;
            current_value_usd: number;
            unrealized_pnl_usd: number;
            pnl_pct: number;
            trade_mode: string;
            created_at: string;
            exchange_account: {
                id: number;
                label: string;
                exchange: string;
            };
            subscriber: {
                id: number;
                email: string;
                full_name: string | null;
            };
        }>;
        summary: {
            total_positions: number;
            total_value_usd: number;
            total_unrealized_pnl_usd: number;
            avg_pnl_pct: number;
        };
    }> => {
        const response = await apiClient.get('/admin/subscribers/heatmap', { params: filters })
        return response.data
    },

    // ============================================
    // SUBSCRIBER MONITORING TP/SL
    // ============================================

    getSubscribersMonitoringTPSL: async (filters?: {
        subscriber_id?: number;
        trade_mode?: 'REAL' | 'SIMULATION';
        sort_by?: 'tp-closest' | 'sl-closest' | 'profit-highest' | 'profit-lowest';
    }): Promise<{
        data: Array<{
            id: number;
            symbol: string;
            qty_remaining: number;
            price_open: number;
            current_price: number;
            pnl_pct: number;
            invested_value_usd: number;
            current_value_usd: number;
            unrealized_pnl_usd: number;
            trade_mode: string;
            created_at: string;
            tp_enabled: boolean;
            tp_pct: number | null;
            tp_target_price: number | null;
            tp_proximity_pct: number | null;
            sl_enabled: boolean;
            sl_pct: number | null;
            sl_target_price: number | null;
            sl_proximity_pct: number | null;
            sg_enabled: boolean;
            sg_pct: number | null;
            sg_drop_pct: number | null;
            sg_proximity_pct: number | null;
            sg_triggered: boolean;
            tsg_enabled: boolean;
            tsg_status: {
                activation_pct: number;
                drop_pct: number | null;
                is_activated: boolean;
                max_pnl_pct: number | null;
                proximity_to_activation: number;
            } | null;
            tsg_triggered: boolean;
            lock_sell_by_webhook: boolean;
            exchange_account: {
                id: number;
                label: string;
                exchange: string;
            };
            subscriber: {
                id: number;
                email: string;
                full_name: string | null;
            };
        }>;
        summary: {
            total_positions: number;
            positions_with_tp: number;
            positions_with_sl: number;
            positions_with_sg: number;
            positions_with_tsg: number;
        };
    }> => {
        const response = await apiClient.get('/admin/subscribers/monitoring-tp-sl', { params: filters })
        return response.data
    },

    // ============================================
    // DEBUG TOOLS - MIGRATE TO SUBSCRIBER
    // ============================================

    getUsersForMigration: async (): Promise<{
        data: Array<{
            id: number;
            email: string;
            full_name: string | null;
            roles: string[];
            accounts_count: number;
            has_subscription: boolean;
        }>;
        total: number;
    }> => {
        const response = await apiClient.get('/admin/debug/users-for-migration')
        return response.data
    },

    getSubscriptionPlansForMigration: async (): Promise<{
        data: Array<{
            id: number;
            name: string;
            description: string | null;
            price_monthly: number;
            price_quarterly: number;
            duration_days: number;
            max_exchange_accounts: number | null;
        }>;
    }> => {
        const response = await apiClient.get('/admin/debug/subscription-plans')
        return response.data
    },

    migrateUserToSubscriber: async (data: {
        user_id: number;
        plan_id: number;
        duration_months?: number;
    }): Promise<{
        success: boolean;
        message: string;
        user: { id: number; email: string; full_name: string | null };
        plan: { id: number; name: string };
        actions: string[];
        webhooks_linked: number;
        accounts_count: number;
    }> => {
        const response = await apiClient.post('/admin/debug/migrate-to-subscriber', data)
        return response.data
    },

    // ============================================
    // DEBUG TOOLS - CLOSE POSITIONS BREAKEVEN
    // ============================================

    closePositionsBreakeven: async (data: {
        position_id: number;
    }): Promise<{
        position_id: number;
        position_closed: boolean;
        job_created: number | null;
        execution_created: number | null;
        error?: string;
        position_info?: {
            symbol: string;
            qty_remaining: number;
            price_open: number;
            exchange_account: string;
        };
    }> => {
        const response = await apiClient.post('/admin/debug/close-positions-breakeven', data)
        return response.data
    },

    // ============================================
    // CCXT LOGS
    // ============================================

    getCcxtLogs: async (lines = 300): Promise<{ entries: any[] }> => {
        const response = await apiClient.get('/admin/ccxt-logs', { params: { lines } })
        return response.data
    },
}

