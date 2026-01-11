/**
 * Constantes de configuração para trading
 * Valores extraídos para centralização e fácil configuração
 */

// ========== VALORES MÍNIMOS ==========

/**
 * Valor mínimo em USD para ordens de compra
 * Abaixo desse valor, a ordem é rejeitada
 */
export const MIN_QUOTE_AMOUNT_BUY_USD = 20;

/**
 * Valor mínimo em USD para considerar uma posição vendível
 * Posições abaixo desse valor são consideradas "dust" (resíduo)
 */
export const MIN_POSITION_VALUE_USD = 5;

// ========== SLIPPAGE E PREÇOS ==========

/**
 * Slippage padrão para ordens LIMIT de venda (SL/TP/TSG)
 * 0.001 = 0.1% abaixo do preço atual
 */
export const DEFAULT_SELL_LIMIT_SLIPPAGE = 0.001;

/**
 * Multiplicador para calcular preço LIMIT de venda
 * Exemplo: currentPrice * (1 - DEFAULT_SELL_LIMIT_SLIPPAGE) = currentPrice * 0.999
 */
export const SELL_LIMIT_PRICE_MULTIPLIER = 1 - DEFAULT_SELL_LIMIT_SLIPPAGE;

// ========== CACHE ==========

/**
 * TTL do cache de adapters de exchange em milissegundos (5 minutos)
 */
export const ADAPTER_CACHE_TTL_MS = 300000;

/**
 * Tamanho máximo do cache de adapters
 * Após esse limite, adapters antigos são removidos
 */
export const ADAPTER_CACHE_MAX_SIZE = 50;

// ========== TOLERÂNCIAS ==========

/**
 * Margem de tolerância para comparação de quantidades
 * Usado para lidar com imprecisões de ponto flutuante
 * 0.01 = 1%
 */
export const QUANTITY_COMPARISON_MARGIN = 0.01;

/**
 * Precisão mínima para validação de quantidade (8 casas decimais)
 */
export const MIN_QUANTITY_PRECISION = 0.00000001;
