import type {
  AuthenticatedSession,
  AuthenticationGateway,
  SessionRepository,
} from '../../interfaces/provisioning';
import { AuthenticationUnavailableError } from '../../interfaces/provisioning';
import { isDesktopPortalRole } from '@nemis-desktop/types';

export class AuthenticateUser {
  constructor(
    private readonly gateway: AuthenticationGateway,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(email: string, password: string): Promise<AuthenticatedSession> {
    const session = await this.gateway.authenticate(email.trim().toLowerCase(), password);
    assertDesktopUser(session);
    await this.sessions.save(session);
    return session;
  }
}

export class RestoreSession {
  constructor(
    private readonly gateway: AuthenticationGateway,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(): Promise<AuthenticatedSession | null> {
    const stored = await this.sessions.load();
    if (!stored) return null;
    try {
      const restored = await this.gateway.restore(stored.sessionSecret);
      assertDesktopUser(restored);
      await this.sessions.save(restored);
      return restored;
    } catch (error) {
      if (error instanceof AuthenticationUnavailableError) {
        if (
          stored.offlineAccessExpiresAt &&
          new Date(stored.offlineAccessExpiresAt).valueOf() > Date.now()
        ) {
          return stored;
        }
        await this.sessions.clear();
        return null;
      }
      await this.sessions.clear();
      return null;
    }
  }
}

export class Logout {
  constructor(
    private readonly gateway: AuthenticationGateway,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(): Promise<void> {
    const stored = await this.sessions.load();
    try {
      if (stored) await this.gateway.logout(stored.sessionSecret);
    } finally {
      await this.sessions.clear();
    }
  }
}

function assertDesktopUser(session: AuthenticatedSession): void {
  if (!isDesktopPortalRole(session.user.role) || !session.user.scope.scopeId) {
    throw new Error('This account does not have a supported NEMIS Desktop role and scope.');
  }
}
