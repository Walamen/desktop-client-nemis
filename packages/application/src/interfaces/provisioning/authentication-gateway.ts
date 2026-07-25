import type { ProvisioningUser } from '@nemis-desktop/types';

export interface AuthenticatedSession {
  readonly user: ProvisioningUser;
  /** Opaque cookie material. It must only be persisted by a protected store. */
  readonly sessionSecret: string;
}

export interface AuthenticationGateway {
  authenticate(email: string, password: string): Promise<AuthenticatedSession>;
  restore(sessionSecret: string): Promise<AuthenticatedSession>;
  logout(sessionSecret: string): Promise<void>;
}

export interface SessionRepository {
  load(): Promise<AuthenticatedSession | null>;
  save(session: AuthenticatedSession): Promise<void>;
  clear(): Promise<void>;
}

export class AuthenticationUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AuthenticationUnavailableError';
  }
}
