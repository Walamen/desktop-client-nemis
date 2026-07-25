import { describe, expect, it } from 'vitest';
import type {
  AuthenticatedSession,
  AuthenticationGateway,
  SessionRepository,
} from '../../interfaces/provisioning';
import { AuthenticateUser, Logout, RestoreSession } from './authentication';
import { AuthenticationUnavailableError } from '../../interfaces/provisioning';

const valid: AuthenticatedSession = {
  user: {
    id: 'user-1',
    email: 'admin@school.edu',
    firstName: 'School',
    lastName: 'Admin',
    role: 'INSTITUTION_ADMIN',
    institutionId: 'school-1',
  },
  sessionSecret: 'opaque',
};

class Sessions implements SessionRepository {
  value: AuthenticatedSession | null = null;
  async load() { return this.value; }
  async save(value: AuthenticatedSession) { this.value = value; }
  async clear() { this.value = null; }
}

function gateway(session = valid): AuthenticationGateway {
  return {
    authenticate: async () => session,
    restore: async () => session,
    logout: async () => undefined,
  };
}

describe('provisioning authentication use cases', () => {
  it('normalizes email and persists only the opaque session', async () => {
    const sessions = new Sessions();
    let received = '';
    const auth = gateway();
    auth.authenticate = async (email) => { received = email; return valid; };
    await new AuthenticateUser(auth, sessions).execute(' ADMIN@SCHOOL.EDU ', 'password');
    expect(received).toBe('admin@school.edu');
    expect(sessions.value).toEqual(valid);
    expect(JSON.stringify(sessions.value)).not.toContain('password');
  });

  it('clears an invalid restored session', async () => {
    const sessions = new Sessions();
    sessions.value = valid;
    const auth = gateway();
    auth.restore = async () => { throw new Error('expired'); };
    await expect(new RestoreSession(auth, sessions).execute()).resolves.toBeNull();
    expect(sessions.value).toBeNull();
  });

  it('restores the protected local identity while provisioned users are offline', async () => {
    const sessions = new Sessions();
    sessions.value = valid;
    const auth = gateway();
    auth.restore = async () => {
      throw new AuthenticationUnavailableError('offline');
    };
    await expect(new RestoreSession(auth, sessions).execute()).resolves.toEqual(valid);
    expect(sessions.value).toEqual(valid);
  });

  it('clears local state even when remote logout fails', async () => {
    const sessions = new Sessions();
    sessions.value = valid;
    const auth = gateway();
    auth.logout = async () => { throw new Error('offline'); };
    await expect(new Logout(auth, sessions).execute()).rejects.toThrow('offline');
    expect(sessions.value).toBeNull();
  });
});
