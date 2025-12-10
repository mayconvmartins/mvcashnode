import { WebhookAction } from '@mvcashnode/shared';
import { normalizeSymbol, ensureSymbolFormat } from '@mvcashnode/shared';

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
    // ✅ BUG-ALTO-008 FIX: Validar tamanho do payload antes de processar
    const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024; // 1MB para parsing
    const payloadSize = typeof payload === 'string' 
      ? Buffer.byteLength(payload, 'utf8')
      : Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
    
    if (payloadSize > MAX_PAYLOAD_SIZE) {
      throw new Error(
        `Payload size (${(payloadSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (1MB) for parsing`
      );
    }
    
    // Truncar payloads grandes nos logs
    const logPayload = typeof payload === 'string'
      ? (payload.length > 500 ? payload.substring(0, 500) + '...' : payload)
      : (JSON.stringify(payload).length > 500 ? JSON.stringify(payload).substring(0, 500) + '...' : JSON.stringify(payload));
    
    let text = '';
    let symbolRaw = '';
    let action = WebhookAction.UNKNOWN;
    let timeframe: string | undefined;
    let priceReference: number | undefined;
    let patternName: string | undefined;

    console.log(`[WEBHOOK-PARSER] Payload recebido (tipo: ${typeof payload}, tamanho: ${payloadSize} bytes):`, logPayload);

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
      // Priorizar regex que procura especificamente por "Preço" ou "Price" para evitar pegar timeframe
      if (!priceReference) {
        console.log(`[WEBHOOK-PARSER] Tentando extrair preço do texto: "${text}"`);
        
        // Primeiro, tentar pegar preço após "Preço" ou "Price" (mais específico)
        const priceMatch1 = text.match(/[Pp]re[çc]o\s*\(([\d.,]+)\)/i);
        const priceMatch2 = text.match(/[Pp]rice\s*\(([\d.,]+)\)/i);
        
        // Se não encontrou, tentar pegar o último número entre parênteses (fallback)
        // Mas só se não for um timeframe conhecido (H1, H4, M15, D1, etc)
        let priceMatch3 = null;
        if (!priceMatch1 && !priceMatch2) {
          const allMatches = text.matchAll(/\(([\d.,]+)\)/g);
          const matchesArray = Array.from(allMatches);
          // Pegar o último match que não seja um timeframe
          for (let i = matchesArray.length - 1; i >= 0; i--) {
            const match = matchesArray[i];
            const value = match[1];
            // Verificar se não é um timeframe (H1, H4, M15, D1, etc)
            if (!/^[A-Z]?\d+[A-Z]?$/i.test(value)) {
              priceMatch3 = match;
              break;
            }
          }
        }
        
        console.log(`[WEBHOOK-PARSER] Tentativas de match: match1=${priceMatch1 ? priceMatch1[1] : 'null'}, match2=${priceMatch2 ? priceMatch2[1] : 'null'}, match3=${priceMatch3 ? priceMatch3[1] : 'null'}`);
        
        const priceMatch = priceMatch1 || priceMatch2 || priceMatch3;
        if (priceMatch) {
          priceReference = Number(priceMatch[1].replace(',', '.'));
          if (isNaN(priceReference) || priceReference <= 0) {
            console.warn(`[WEBHOOK-PARSER] ⚠️ Preço extraído é inválido: ${priceMatch[1]}`);
            priceReference = undefined;
          } else {
            console.log(`[WEBHOOK-PARSER] ✅ Preço extraído com sucesso: ${priceReference}`);
          }
        } else {
          console.warn(`[WEBHOOK-PARSER] ⚠️ Nenhum preço encontrado no texto`);
        }
      } else {
        console.log(`[WEBHOOK-PARSER] Preço já definido anteriormente: ${priceReference}`);
      }

      // Extract pattern name
      if (text.includes('Caça Fundo')) {
        patternName = 'Caça Fundo';
      } else if (text.includes('Caça Topo')) {
        patternName = 'Caça Topo';
      }
    }

    // Normalize symbol - garantir formato BASE/QUOTE
    let symbolNormalized = '';
    if (symbolRaw) {
      try {
        // Primeiro normalizar (remove sufixos .P, .F, etc)
        const normalized = normalizeSymbol(symbolRaw);
        // Depois garantir formato BASE/QUOTE
        symbolNormalized = ensureSymbolFormat(normalized);
        console.log(`[WEBHOOK-PARSER] Símbolo normalizado: "${symbolRaw}" -> "${symbolNormalized}"`);
      } catch (error: any) {
        console.error(`[WEBHOOK-PARSER] Erro ao normalizar símbolo "${symbolRaw}": ${error.message}`);
        // Em caso de erro, usar o símbolo normalizado sem barra como fallback
        symbolNormalized = normalizeSymbol(symbolRaw);
      }
    }

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

