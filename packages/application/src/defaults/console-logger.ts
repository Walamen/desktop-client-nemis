import type { IAppLogger } from '../interfaces/app-logger';

/** Minimal dev logger. Production wiring (electron-log) is supplied by the app. */
export class ConsoleLogger implements IAppLogger {
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(message, meta ?? {});
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(message, meta ?? {});
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(message, meta ?? {});
  }
}
