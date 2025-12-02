import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

export class TimezoneService {
  private timezone: string;

  constructor(timezone: string = 'UTC') {
    this.timezone = timezone;
    this.validateTimezone();
  }

  /**
   * Valida se o timezone é válido
   */
  private validateTimezone(): void {
    try {
      // Tenta criar uma data no timezone para validar
      const testDate = new Date();
      toZonedTime(testDate, this.timezone);
    } catch (error) {
      console.error(`[Timezone] Timezone inválido: ${this.timezone}. Usando UTC.`);
      this.timezone = 'UTC';
    }
  }

  /**
   * Retorna o timezone configurado
   */
  getTimezone(): string {
    return this.timezone;
  }

  /**
   * Converte Date para o timezone configurado
   */
  toTimezone(date: Date): Date {
    return toZonedTime(date, this.timezone);
  }

  /**
   * Converte Date do timezone configurado para UTC
   */
  fromTimezone(date: Date): Date {
    return fromZonedTime(date, this.timezone);
  }

  /**
   * Formata data no timezone configurado
   */
  format(date: Date, formatString: string = 'yyyy-MM-dd HH:mm:ss'): string {
    const zonedDate = toZonedTime(date, this.timezone);
    return format(zonedDate, formatString, { timeZone: this.timezone });
  }

  /**
   * Formata data ISO no timezone configurado
   */
  formatISO(date: Date): string {
    const zonedDate = toZonedTime(date, this.timezone);
    return format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx", { timeZone: this.timezone });
  }

  /**
   * Parse string ISO para Date no timezone configurado
   */
  parseISO(dateString: string): Date {
    const date = parseISO(dateString);
    return this.toTimezone(date);
  }

  /**
   * Retorna data atual no timezone configurado
   */
  now(): Date {
    return toZonedTime(new Date(), this.timezone);
  }

  /**
   * Retorna offset do timezone em minutos
   */
  getOffset(): number {
    const date = new Date();
    const zonedDate = toZonedTime(date, this.timezone);
    const utcDate = new Date(date.toUTCString());
    return (zonedDate.getTime() - utcDate.getTime()) / (1000 * 60);
  }

  /**
   * Retorna informações do timezone
   */
  getInfo(): {
    timezone: string;
    offset: number;
    offsetString: string;
    currentTime: string;
  } {
    const offset = this.getOffset();
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    const offsetString = `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    return {
      timezone: this.timezone,
      offset,
      offsetString,
      currentTime: this.format(new Date(), 'yyyy-MM-dd HH:mm:ss zzz'),
    };
  }
}

