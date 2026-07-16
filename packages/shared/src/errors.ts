import type { IpcErrorCode, IpcErrorPayload } from '@nemis-desktop/types';

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

export class ForbiddenError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('FORBIDDEN', message, options);
  }
}

const APPLICATION_CODES = new Set<IpcErrorCode>(['FORBIDDEN', 'IPC_ERROR']);

function narrowApplicationCode(code: string): IpcErrorCode {
  return APPLICATION_CODES.has(code as IpcErrorCode) ? (code as IpcErrorCode) : 'UNEXPECTED_ERROR';
}

/**
 * Converts any thrown value into a payload safe to send across IPC.
 * Unknown errors are masked so internals never leak to the renderer.
 * Codes outside the IpcErrorCode contract are masked to UNEXPECTED_ERROR.
 */
export function toIpcErrorPayload(error: unknown): IpcErrorPayload {
  if (error instanceof ApplicationError) {
    const code = narrowApplicationCode(error.code);
    return code === 'UNEXPECTED_ERROR'
      ? { code, message: 'An unexpected error occurred.' }
      : { code, message: error.message };
  }
  return { code: 'UNEXPECTED_ERROR', message: 'An unexpected error occurred.' };
}
