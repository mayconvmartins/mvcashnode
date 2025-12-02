"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeAccountService = void 0;
class ExchangeAccountService {
    prisma;
    encryptionService;
    constructor(prisma, encryptionService) {
        this.prisma = prisma;
        this.encryptionService = encryptionService;
    }
    async createAccount(dto) {
        let apiKeyEnc = null;
        let apiSecretEnc = null;
        if (!dto.isSimulation && dto.apiKey && dto.apiSecret) {
            apiKeyEnc = await this.encryptionService.encrypt(dto.apiKey);
            apiSecretEnc = await this.encryptionService.encrypt(dto.apiSecret);
        }
        return this.prisma.exchangeAccount.create({
            data: {
                user_id: dto.userId,
                exchange: dto.exchange,
                label: dto.label,
                is_simulation: dto.isSimulation,
                api_key_enc: apiKeyEnc,
                api_secret_enc: apiSecretEnc,
                proxy_url: dto.proxyUrl || null,
                testnet: dto.testnet || false,
                initial_balances_json: dto.initialBalances ? JSON.parse(JSON.stringify(dto.initialBalances)) : null,
            },
        });
    }
    async getAccountById(accountId, userId) {
        const where = { id: accountId };
        if (userId)
            where.user_id = userId;
        return this.prisma.exchangeAccount.findFirst({
            where,
            include: {
                balances_cache: true,
            },
        });
    }
    async getAccountsByUser(userId) {
        return this.prisma.exchangeAccount.findMany({
            where: { user_id: userId },
            include: {
                balances_cache: true,
            },
        });
    }
    async updateAccount(accountId, userId, updates) {
        const updateData = {};
        if (updates.label !== undefined)
            updateData.label = updates.label;
        if (updates.isSimulation !== undefined)
            updateData.is_simulation = updates.isSimulation;
        if (updates.proxyUrl !== undefined)
            updateData.proxy_url = updates.proxyUrl;
        if (updates.testnet !== undefined)
            updateData.testnet = updates.testnet;
        if (updates.initialBalances !== undefined) {
            updateData.initial_balances_json = JSON.parse(JSON.stringify(updates.initialBalances));
        }
        if (!updates.isSimulation && updates.apiKey && updates.apiSecret) {
            updateData.api_key_enc = await this.encryptionService.encrypt(updates.apiKey);
            updateData.api_secret_enc = await this.encryptionService.encrypt(updates.apiSecret);
        }
        return this.prisma.exchangeAccount.update({
            where: { id: accountId, user_id: userId },
            data: updateData,
        });
    }
    async deleteAccount(accountId, userId) {
        return this.prisma.exchangeAccount.delete({
            where: { id: accountId, user_id: userId },
        });
    }
    async decryptApiKeys(accountId) {
        const account = await this.prisma.exchangeAccount.findUnique({
            where: { id: accountId },
        });
        if (!account || !account.api_key_enc || !account.api_secret_enc) {
            return null;
        }
        return {
            apiKey: await this.encryptionService.decrypt(account.api_key_enc),
            apiSecret: await this.encryptionService.decrypt(account.api_secret_enc),
        };
    }
    async syncBalance(accountId, tradeMode, balances) {
        const updates = Object.entries(balances).map(([asset, balance]) => this.prisma.accountBalanceCache.upsert({
            where: {
                exchange_account_id_trade_mode_asset: {
                    exchange_account_id: accountId,
                    trade_mode: tradeMode,
                    asset,
                },
            },
            update: {
                free: balance.free,
                locked: balance.locked,
                last_sync_at: new Date(),
            },
            create: {
                exchange_account_id: accountId,
                trade_mode: tradeMode,
                asset,
                free: balance.free,
                locked: balance.locked,
            },
        }));
        await Promise.all(updates);
    }
}
exports.ExchangeAccountService = ExchangeAccountService;
//# sourceMappingURL=exchange-account.service.js.map