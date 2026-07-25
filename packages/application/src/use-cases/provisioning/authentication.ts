import type {
  AuthenticatedSession,
  AuthenticationGateway,
  SessionRepository,
} from '../../interfaces/provisioning';
import { AuthenticationUnavailableError } from '../../interfaces/provisioning';

const REQUIRED_ROLE = 'INSTITUTION_ADMIN';

export class AuthenticateUser {
  constructor(
    private readonly gateway: AuthenticationGateway,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(email: string, password: string): Promise<AuthenticatedSession> {
    const session = await this.gateway.authenticate(email.trim().toLowerCase(), password);
    assertSchoolAdministrator(session);
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
      assertSchoolAdministrator(restored);
      await this.sessions.save(restored);
      return restored;
    } catch (error) {
      if (error instanceof AuthenticationUnavailableError) return stored;
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

function assertSchoolAdministrator(session: AuthenticatedSession): void {
  if (session.user.role !== REQUIRED_ROLE || !session.user.institutionId) {
    throw new Error('Only an active Institution Administrator assigned to a school can provision.');
  }
}
