"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
class NotificationService {
    prisma;
    whatsappClient;
    constructor(prisma, whatsappClient) {
        this.prisma = prisma;
        this.whatsappClient = whatsappClient;
    }
    async sendPositionAlert(positionId, alertType) {
        const position = await this.prisma.tradePosition.findUnique({
            where: { id: positionId },
            include: {
                exchange_account: {
                    include: {
                        user: {
                            include: {
                                profile: true,
                            },
                        },
                    },
                },
            },
        });
        if (!position || !position.exchange_account.user.profile?.whatsapp_phone) {
            return;
        }
        const existing = await this.prisma.positionAlertSent.findUnique({
            where: {
                position_id_alert_type: {
                    position_id: positionId,
                    alert_type: alertType,
                },
            },
        });
        if (existing) {
            return;
        }
        const message = this.formatPositionAlert(position, alertType);
        try {
            await this.whatsappClient.sendMessage(position.exchange_account.user.profile.whatsapp_phone, message);
            await this.prisma.positionAlertSent.create({
                data: {
                    position_id: positionId,
                    alert_type: alertType,
                },
            });
        }
        catch (error) {
            console.error('Failed to send position alert:', error);
        }
    }
    formatPositionAlert(position, alertType) {
        const symbol = position.symbol;
        const qty = position.qty_remaining.toNumber();
        const price = position.price_open.toNumber();
        switch (alertType) {
            case 'OPENED':
                return `✅ Posição ABERTA\n${symbol}\nQuantidade: ${qty}\nPreço: ${price}`;
            case 'CLOSED':
                return `🔒 Posição FECHADA\n${symbol}\nLucro: ${position.realized_profit_usd.toNumber()} USDT`;
            case 'STOP_LOSS':
                return `🛑 STOP LOSS acionado\n${symbol}\nPreço: ${price}`;
            case 'TAKE_PROFIT':
                return `🎯 TAKE PROFIT acionado\n${symbol}\nLucro: ${position.realized_profit_usd.toNumber()} USDT`;
            default:
                return `Posição ${symbol} atualizada`;
        }
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map