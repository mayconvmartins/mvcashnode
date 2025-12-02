export * from './adapters';
export * from './exchange-adapter';
export * from './adapter-factory';
export type { TestConnectionResult } from './exchange-adapter';

// Exportações explícitas dos adapters para configuração NTP
export { BinanceSpotAdapter } from './adapters/binance-spot.adapter';
export { BybitSpotAdapter } from './adapters/bybit-spot.adapter';

