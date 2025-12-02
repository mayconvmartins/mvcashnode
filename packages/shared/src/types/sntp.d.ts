declare module 'sntp' {
  export interface TimeOptions {
    host?: string;
    port?: number;
    timeout?: number;
  }

  export interface TimeResult {
    t: number;
    d: number;
    receivedLocally: number;
  }

  export function time(options?: TimeOptions): Promise<TimeResult>;
  export function offset(options?: TimeOptions): Promise<number>;
  export function now(): number;
}

