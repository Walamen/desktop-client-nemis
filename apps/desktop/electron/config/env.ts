import path from 'node:path';
import { app } from 'electron';
import dotenv from 'dotenv';
import { ConfigurationError } from '@nemis-desktop/shared';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  readonly isDev: boolean;
  readonly rendererDevUrl: string;
  readonly logLevel: LogLevel;
}

let cachedConfig: AppConfig | null = null;

/**
 * Loads and validates configuration once per process.
 * Env files are optional overrides; safe defaults are built in.
 * Throws ConfigurationError on invalid values (fail fast at startup).
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const isDev = !app.isPackaged;
  const envFile = isDev ? '.env.development' : '.env.production';
  dotenv.config({ path: path.join(app.getAppPath(), envFile) });

  const logLevel = process.env.NEMIS_LOG_LEVEL ?? (isDev ? 'debug' : 'info');
  if (!isLogLevel(logLevel)) {
    throw new ConfigurationError(
      `Invalid NEMIS_LOG_LEVEL "${logLevel}". Expected one of: ${LOG_LEVELS.join(', ')}.`,
    );
  }

  cachedConfig = {
    isDev,
    rendererDevUrl: process.env.NEMIS_RENDERER_DEV_URL ?? 'http://localhost:3010',
    logLevel,
  };
  return cachedConfig;
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}
