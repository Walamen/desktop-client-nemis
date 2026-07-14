import type { IpcErrorPayload } from '@nemis-desktop/types';

export class ApplicationError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class IPCError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('IPC_ERROR', message, options);
  }
}

export class ConfigurationError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('CONFIGURATION_ERROR', message, options);
  }
}

/**
 * Converts any thrown value into a payload safe to send across IPC.
 * Unknown errors are masked so internals never leak to the renderer.
 */
export function toIpcErrorPayload(error: unknown): IpcErrorPayload {
  if (error instanceof ApplicationError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'UNEXPECTED_ERROR', message: 'An unexpected error occurred.' };
}
