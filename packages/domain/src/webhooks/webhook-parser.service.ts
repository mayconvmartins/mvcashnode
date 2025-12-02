import { WebhookAction } from '@mvcashnode/shared';
import { normalizeSymbol } from '@mvcashnode/shared';

export interface ParsedSignal {
  symbolRaw: string;
  symbolNormalized: string;
  action: WebhookAction;
  timeframe?: string;
  priceReference?: number;
  patternName?: string;
}

export class WebhookParserService {
  parseSignal(payload: string | Record<string, unknown>): ParsedSignal {
    let text = '';
    let symbolRaw = '';
    let action = WebhookAction.UNKNOWN;
    let timeframe: string | undefined;
    let priceReference: number | undefined;
    let patternName: string | undefined;

    if (typeof payload === 'string') {
      text = payload;
    } else {
      text = payload.text || payload.message || JSON.stringify(payload);
      symbolRaw = (payload.symbol || payload.ticker || '') as string;
      const payloadAction = (payload.action || '') as string;
      if (payloadAction === 'BUY' || payloadAction === 'SELL') {
        action = payloadAction === 'BUY' ? WebhookAction.BUY_SIGNAL : WebhookAction.SELL_SIGNAL;
      }
      timeframe = (payload.timeframe || payload.interval || '') as string;
      priceReference = payload.price ? Number(payload.price) : undefined;
    }

    // Parse TradingView format: "SOLUSDT.P Caça Fundo 🟢 (H1) Preço (213.09)"
    if (!symbolRaw && text) {
      const parts = text.trim().split(/\s+/);
      if (parts.length > 0) {
        symbolRaw = parts[0];
      }

      // Detect action from text
      const lowerText = text.toLowerCase();
      if (lowerText.includes('caça fundo') || lowerText.includes('🟢') || lowerText.includes('compra') || lowerText.includes('buy')) {
        action = WebhookAction.BUY_SIGNAL;
      } else if (lowerText.includes('caça topo') || lowerText.includes('🔴') || lowerText.includes('venda') || lowerText.includes('sell')) {
        action = WebhookAction.SELL_SIGNAL;
      }

      // Extract timeframe from (H1), (H4), etc
      const timeframeMatch = text.match(/\(([A-Z]\d+)\)/);
      if (timeframeMatch) {
        timeframe = timeframeMatch[1];
      }

      // Extract price from "Preço (213.09)"
      const priceMatch = text.match(/[Pp]reço\s*\(([\d.]+)\)/);
      if (priceMatch) {
        priceReference = Number(priceMatch[1]);
      }

      // Extract pattern name
      if (text.includes('Caça Fundo')) {
        patternName = 'Caça Fundo';
      } else if (text.includes('Caça Topo')) {
        patternName = 'Caça Topo';
      }
    }

    // Normalize symbol
    const symbolNormalized = symbolRaw ? normalizeSymbol(symbolRaw) : '';

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

