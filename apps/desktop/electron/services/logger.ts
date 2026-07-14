import log from 'electron-log/main';
import type { LogLevel } from '@app/config/env';

/**
 * Console transport always on (development visibility).
 * File transport only in production builds.
 */
export function initLogger(options: { isDev: boolean; level: LogLevel }): void {
  log.initialize();
  log.transports.console.level = options.level;
  log.transports.file.level = options.isDev ? false : options.level;
}

export const logger = log;
