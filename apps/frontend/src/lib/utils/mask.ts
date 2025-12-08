/**
 * Aplica máscara de CPF (000.000.000-00)
 */
export function maskCpf(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 11) {
    return cleaned
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return value;
}

/**
 * Aplica máscara de CEP (00000-000)
 */
export function maskCep(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 8) {
    return cleaned.replace(/(\d{5})(\d)/, '$1-$2');
  }
  return value;
}

/**
 * Aplica máscara de telefone ((00) 00000-0000)
 */
export function maskPhone(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 10) {
    return cleaned
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  } else if (cleaned.length <= 11) {
    return cleaned
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  }
  return value;
}
