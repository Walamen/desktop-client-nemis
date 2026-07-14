import path from 'node:path';
import { app } from 'electron';
import dotenv from 'dotenv';
import { parseConfig } from '@app/config/parseConfig';
import type { AppConfig } from '@app/config/parseConfig';

export type { AppConfig, LogLevel } from '@app/config/parseConfig';

let cachedConfig: AppConfig | null = null;

/**
 * Loads and validates configuration once per process.
 * Env files are optional overrides; safe defaults are built in.
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const isDev = !app.isPackaged;
  const envFile = isDev ? '.env.development' : '.env.production';
  dotenv.config({ path: path.join(app.getAppPath(), envFile) });

  cachedConfig = parseConfig(process.env, isDev);
  return cachedConfig;
}
