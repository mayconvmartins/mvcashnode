"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookParserService = void 0;
const shared_1 = require("@mvcashnode/shared");
const shared_2 = require("@mvcashnode/shared");
class WebhookParserService {
    parseSignal(payload) {
        let text = '';
        let symbolRaw = '';
        let action = shared_1.WebhookAction.UNKNOWN;
        let timeframe;
        let priceReference;
        let patternName;
        if (typeof payload === 'string') {
            text = payload;
        }
        else {
            const textValue = payload.text || payload.message;
            text = typeof textValue === 'string' ? textValue : JSON.stringify(payload);
            symbolRaw = (payload.symbol || payload.ticker || '');
            const payloadAction = (payload.action || '');
            if (payloadAction === 'BUY' || payloadAction === 'SELL') {
                action = payloadAction === 'BUY' ? shared_1.WebhookAction.BUY_SIGNAL : shared_1.WebhookAction.SELL_SIGNAL;
            }
            timeframe = (payload.timeframe || payload.interval || '');
            priceReference = payload.price ? Number(payload.price) : undefined;
        }
        if (!symbolRaw && text) {
            const parts = text.trim().split(/\s+/);
            if (parts.length > 0) {
                symbolRaw = parts[0];
            }
            const lowerText = text.toLowerCase();
            if (lowerText.includes('caça fundo') || lowerText.includes('🟢') || lowerText.includes('compra') || lowerText.includes('buy')) {
                action = shared_1.WebhookAction.BUY_SIGNAL;
            }
            else if (lowerText.includes('caça topo') || lowerText.includes('🔴') || lowerText.includes('venda') || lowerText.includes('sell')) {
                action = shared_1.WebhookAction.SELL_SIGNAL;
            }
            const timeframeMatch = text.match(/\(([A-Z]\d+)\)/);
            if (timeframeMatch) {
                timeframe = timeframeMatch[1];
            }
            const priceMatch = text.match(/[Pp]reço\s*\(([\d.]+)\)/);
            if (priceMatch) {
                priceReference = Number(priceMatch[1]);
            }
            if (text.includes('Caça Fundo')) {
                patternName = 'Caça Fundo';
            }
            else if (text.includes('Caça Topo')) {
                patternName = 'Caça Topo';
            }
        }
        const symbolNormalized = symbolRaw ? (0, shared_2.normalizeSymbol)(symbolRaw) : '';
        return {
            symbolRaw: symbolRaw || '',
            symbolNormalized,
            action,
            timeframe,
            priceReference,
            patternName,
        };
    }
}
exports.WebhookParserService = WebhookParserService;
//# sourceMappingURL=webhook-parser.service.js.map