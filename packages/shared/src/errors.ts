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

export class UnauthorizedError extends ApplicationError {
  constructor(message = 'The email or password is incorrect.', options?: { cause?: unknown }) {
    super('UNAUTHORIZED', message, options);
  }
}

const APPLICATION_CODES = new Set<IpcErrorCode>(['FORBIDDEN', 'UNAUTHORIZED', 'IPC_ERROR']);

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

/** The NEMIS server could not be reached (network down, DNS, timeout). The
 * default message is load-bearing: DesktopSyncWorker recognises an
 * unreachable server by this exact text and returns queued items unpenalised. */
export class OfflineError extends ApplicationError {
  constructor(message = 'The NEMIS server could not be reached.', options?: { cause?: unknown }) {
    super('OFFLINE', message, options);
  }
}

/** The server answered 4xx (other than 401/403/429). `message` stays the
 * transport text existing sync code embeds; the server's own explanation is
 * kept apart in `remoteMessage`, and only the main-process IPC mapper decides
 * whether it may reach the renderer. */
export class RemoteRejectedError extends ApplicationError {
  readonly status: number;
  readonly remoteMessage: string | undefined;

  constructor(status: number, remoteMessage?: string, options?: { cause?: unknown }) {
    super('REMOTE_REJECTED', `Provisioning request failed with status ${status}.`, options);
    this.status = status;
    this.remoteMessage = remoteMessage;
  }
}

/** The server answered 429 — a registry rate-limit budget is spent. */
export class RateLimitedError extends ApplicationError {
  readonly status = 429;
  readonly remoteMessage: string | undefined;

  constructor(remoteMessage?: string, options?: { cause?: unknown }) {
    super('RATE_LIMITED', 'Provisioning request failed with status 429.', options);
    this.remoteMessage = remoteMessage;
  }
}
