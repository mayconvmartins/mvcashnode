export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

export function isExpired(date: Date | string, now: Date = new Date()): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < now;
}

export function getUnixTimestamp(date?: Date): number {
  return Math.floor((date || new Date()).getTime() / 1000);
}

