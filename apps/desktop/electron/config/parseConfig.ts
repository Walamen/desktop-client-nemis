import { ConfigurationError } from '@nemis-desktop/shared';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  readonly isDev: boolean;
  readonly rendererDevUrl: string;
  readonly logLevel: LogLevel;
}

/**
 * Pure config validation: env values in, validated AppConfig out.
 * Throws ConfigurationError on invalid values (fail fast at startup).
 */
export function parseConfig(env: NodeJS.ProcessEnv, isDev: boolean): AppConfig {
  const logLevel = env.NEMIS_LOG_LEVEL ?? (isDev ? 'debug' : 'info');
  if (!isLogLevel(logLevel)) {
    throw new ConfigurationError(
      `Invalid NEMIS_LOG_LEVEL "${logLevel}". Expected one of: ${LOG_LEVELS.join(', ')}.`,
    );
  }
  return {
    isDev,
    rendererDevUrl: env.NEMIS_RENDERER_DEV_URL ?? 'http://localhost:3010',
    logLevel,
  };
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}
