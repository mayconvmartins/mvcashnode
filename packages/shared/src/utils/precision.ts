/**
 * Normaliza quantidade para evitar imprecisão de ponto flutuante
 * Arredonda para 8 casas decimais (padrão de criptomoedas)
 * 
 * @param value - Valor numérico a ser normalizado
 * @param decimals - Número de casas decimais (padrão: 8)
 * @returns Valor normalizado com precisão especificada
 * 
 * @example
 * normalizeQuantity(0.000459999999999461) // retorna 0.00046
 * normalizeQuantity(1.2345678912345678) // retorna 1.23456789
 */
export function normalizeQuantity(value: number, decimals: number = 8): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

