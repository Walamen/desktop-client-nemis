import type { IAppLogger } from '../interfaces/app-logger';

interface LogEntry {
  message: string;
  meta?: Record<string, unknown>;
}

export class RecordingLogger implements IAppLogger {
  readonly infos: LogEntry[] = [];
  readonly warns: LogEntry[] = [];
  readonly errors: LogEntry[] = [];

  info(message: string, meta?: Record<string, unknown>): void {
    this.infos.push({ message, meta });
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.warns.push({ message, meta });
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.errors.push({ message, meta });
  }
}
