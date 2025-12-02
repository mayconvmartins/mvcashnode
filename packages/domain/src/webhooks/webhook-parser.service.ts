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

    console.log(`[WEBHOOK-PARSER] Payload recebido (tipo: ${typeof payload}):`, 
      typeof payload === 'string' ? payload : JSON.stringify(payload));

    if (typeof payload === 'string') {
      text = payload.trim();
      console.log(`[WEBHOOK-PARSER] Payload é string, usando como texto: "${text}"`);
    } else if (payload && typeof payload === 'object') {
      // Tentar extrair texto de vários campos possíveis
      const textValue = payload.text || payload.message || payload.body || payload.content || payload.alert || payload.signal;
      
      if (typeof textValue === 'string' && textValue.trim()) {
        text = textValue.trim();
        console.log(`[WEBHOOK-PARSER] Texto extraído de campo do payload: "${text}"`);
      } else if (Object.keys(payload).length === 0) {
        // Payload vazio
        console.warn(`[WEBHOOK-PARSER] Payload é objeto vazio {}`);
      } else {
        // Se não encontrou campo de texto, converter o payload inteiro para string
        const payloadStr = JSON.stringify(payload);
        // Verificar se o payload stringificado parece conter dados úteis
        if (payloadStr !== '{}' && payloadStr !== '[]') {
          text = payloadStr;
          console.log(`[WEBHOOK-PARSER] Usando payload JSON como texto: "${text}"`);
        }
      }
      
      // Extrair campos estruturados se existirem
      symbolRaw = (payload.symbol || payload.ticker || payload.pair || payload.asset || '') as string;
      const payloadAction = (payload.action || payload.side || payload.direction || '') as string;
      if (payloadAction) {
        const actionUpper = payloadAction.toUpperCase();
        if (actionUpper === 'BUY' || actionUpper === 'LONG') {
          action = WebhookAction.BUY_SIGNAL;
        } else if (actionUpper === 'SELL' || actionUpper === 'SHORT') {
          action = WebhookAction.SELL_SIGNAL;
        }
      }
      timeframe = (payload.timeframe || payload.interval || payload.tf || '') as string;
      priceReference = payload.price ? Number(payload.price) : undefined;
      
      console.log(`[WEBHOOK-PARSER] Campos estruturados: symbol=${symbolRaw}, action=${payloadAction}, timeframe=${timeframe}, price=${priceReference}`);
    }

    // Parse TradingView format: "SOLUSDT.P Caça Fundo 🟢 (H1) Preço (213.09)"
    if (text) {
      console.log(`[WEBHOOK-PARSER] Parsing texto TradingView: "${text}"`);
      
      // Extrair símbolo se não foi definido
      if (!symbolRaw) {
        const parts = text.trim().split(/\s+/);
        if (parts.length > 0 && parts[0].length > 0) {
          // Verificar se parece um símbolo (letras maiúsculas, pode ter números e pontos)
          if (/^[A-Z0-9.]+$/i.test(parts[0])) {
            symbolRaw = parts[0].toUpperCase();
            console.log(`[WEBHOOK-PARSER] Símbolo extraído do texto: "${symbolRaw}"`);
          }
        }
      }

      // Detect action from text (se não foi definido)
      if (action === WebhookAction.UNKNOWN) {
        const lowerText = text.toLowerCase();
        // Verificar padrões de compra
        if (lowerText.includes('caça fundo') || 
            text.includes('🟢') || 
            lowerText.includes('compra') || 
            lowerText.includes('buy') ||
            lowerText.includes('long') ||
            lowerText.includes('alta') ||
            lowerText.includes('bullish')) {
          action = WebhookAction.BUY_SIGNAL;
          console.log(`[WEBHOOK-PARSER] Ação detectada: BUY_SIGNAL`);
        } 
        // Verificar padrões de venda
        else if (lowerText.includes('caça topo') || 
                 text.includes('🔴') || 
                 lowerText.includes('venda') || 
                 lowerText.includes('sell') ||
                 lowerText.includes('short') ||
                 lowerText.includes('baixa') ||
                 lowerText.includes('bearish')) {
          action = WebhookAction.SELL_SIGNAL;
          console.log(`[WEBHOOK-PARSER] Ação detectada: SELL_SIGNAL`);
        } else {
          console.warn(`[WEBHOOK-PARSER] Não foi possível detectar ação do texto`);
        }
      }

      // Extract timeframe from (H1), (H4), (M15), (D1), etc
      if (!timeframe) {
        const timeframeMatch = text.match(/\(([A-Z]?\d+[A-Z]?)\)/i);
        if (timeframeMatch) {
          timeframe = timeframeMatch[1].toUpperCase();
          console.log(`[WEBHOOK-PARSER] Timeframe extraído: "${timeframe}"`);
        }
      }

      // Extract price from "Preço (213.09)" or "Price (213.09)" or just "(213.09)"
      if (!priceReference) {
        const priceMatch = text.match(/[Pp]re[çc]o\s*\(([\d.,]+)\)/i) || 
                          text.match(/[Pp]rice\s*\(([\d.,]+)\)/i) ||
                          text.match(/\(([\d.,]+)\)$/);
        if (priceMatch) {
          priceReference = Number(priceMatch[1].replace(',', '.'));
          console.log(`[WEBHOOK-PARSER] Preço extraído: ${priceReference}`);
        }
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

    const result: ParsedSignal = {
      symbolRaw: symbolRaw || '',
      symbolNormalized,
      action,
      timeframe,
      priceReference,
      patternName,
    };

    console.log(`[WEBHOOK-PARSER] Resultado do parsing:`, result);

    return result;
  }
}

