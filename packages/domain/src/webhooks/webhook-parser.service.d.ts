import { WebhookAction } from '@mvcashnode/shared';
export interface ParsedSignal {
    symbolRaw: string;
    symbolNormalized: string;
    action: WebhookAction;
    timeframe?: string;
    priceReference?: number;
    patternName?: string;
}
export declare class WebhookParserService {
    parseSignal(payload: string | Record<string, unknown>): ParsedSignal;
}
//# sourceMappingURL=webhook-parser.service.d.ts.map